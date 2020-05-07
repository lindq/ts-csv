import {Dialect, excel, Quoting} from './dialect';
import {HasNextIterator} from './iterator';

/** Describes a field value read from CSV. */
export type Field = string|number;

/** Describes a row of field values read from CSV. */
export type Row = Field[];

enum ParserState {
  START_RECORD,
  START_FIELD,
  ESCAPED_CHAR,
  IN_FIELD,
  IN_QUOTED_FIELD,
  ESCAPE_IN_QUOTED_FIELD,
  QUOTE_IN_QUOTED_FIELD,
  AFTER_ESCAPED_CRLF,
}

/** Options for the reader. */
interface ReaderOpts {
  dialect?: Dialect;
}

/**
 * CSV reader.
 *
 * Parses string of CSV data to arrays of strings or numbers. The CSV is
 * interpreted according to the given Dialect, with the default being Excel.
 * Typical usage:
 *
 *   const csv === "header 1,header 2\r\nfoo,bar\r\nbaz,qux\r\n";
 *   const parsed = [...reader(csv)];
 *   // parsed === [['header 1', 'header 2'], ['foo', 'bar'], ['baz', 'qux']]
 */
export function* reader(source: string, opts: ReaderOpts = {}) {
  const reader = new Reader(source, opts.dialect);
  for (const row of reader) {
    yield row;
  }
}

/** Options for the recordReader. */
interface RecordReaderOpts extends ReaderOpts {
  /**
   * Field names to use as record keys. If omitted or empty, use values read
   * from the first row.
   */
  fields?: string[];
  /**
   * Key to use for records in the event the number of values read from a row
   * exceeds the number of header fields.
   */
  restKey?: string;
  /**
   * Value to use for records in the event the number of header fields exceeds
   * the number of values read from a row.
   */
  restVal?: Field;
}

/**
 * CSV key-value reader.
 *
 * Parses string of CSV data to key-value pairs of strings or numbers. The CSV
 * is interpreted according to the given Dialect, with the default being
 * Excel. The keys of the resulting objects are taken from the first row of data
 * by default and are assumed to be the header fields. If that is not the case,
 * header fields can be explicitly defined by an argument. Typical usage:
 *
 *   const csv === "header 1,header 2\r\nfoo,bar\r\nbaz,qux\r\n";
 *   const parsed = [...recordReader(csv)];
 *   // parsed === [{'header 1': 'foo', 'header 2': 'baz'},
 *   //             {'header 1': 'bar', 'header 2': 'qux'}]
 *
 * If the number of header fields differs from the number of values read from a
 * given row, either a `restKey` or a `restVal` is used to prevent the loss of
 * data. A `restKey` is used to gather extra values into an array. A `restVal`
 * is used to provide a default value for missing columns. Both can be
 * customized. See `RecordReaderOpts` above.
 */
export function* recordReader(source: string, opts: RecordReaderOpts = {}) {
  const reader = new Reader(source, opts.dialect);
  const headers = opts.fields || reader.next().value || [];
  for (const row of reader) {
    if (row.length) {
      const lh = headers.length;
      const lr = row.length;
      if (lh < lr) {
        // Extra values gathered into an array assigned to restKey.
        yield Object.fromEntries(zip(
            [...headers, opts.restKey], [...row.slice(0, lh), row.slice(lh)]));
        continue;
      } else if (lh > lr) {
        // Extends row to match headers count and fills with restVal.
        const restVal = opts.restVal === undefined ? '' : opts.restVal;
        row.length = lh;
        row.fill(restVal, lr);
      }
      yield Object.fromEntries(zip(headers, row));
    }
  }
}

/** CSV reader implementation */
export class Reader implements IterableIterator<Row> {
  private readonly lines: HasNextIterator<string>;
  private readonly fields: Row = [];
  private field = '';
  private numericField = false;
  private state = ParserState.START_RECORD;
  lineNum = 0;

  constructor(source: string, readonly dialect = excel) {
    if (source.length && !source.endsWith('\n')) {
      source += '\n';
    }
    const lines =
        [...splitLines(source)].map(line => line.replace(/\r\n$/, '\n'));
    this.lines = new HasNextIterator<string>(lines);
  }

  next() {
    this.reset();

    do {
      const result = this.lines.next();
      const line = result.value;

      if (!line) {
        if (this.field.length !== 0 ||
            this.state === ParserState.IN_QUOTED_FIELD) {
          if (this.dialect.strict) {
            this.error('unexpected end of data');
          } else {
            this.saveField();
            break;
          }
        }
        return {value: [], done: true};
      }

      ++this.lineNum;

      const chars = new HasNextIterator<string>(line);
      for (const c of chars) {
        if (c === '\0') {
          this.error('line contains NULL byte');
        }
        this.processChar(c, chars);
      }
    } while (this.state !== ParserState.START_RECORD);

    const fields = this.fields.slice();
    this.fields.length = 0;
    return {value: fields, done: false};
  }

  [Symbol.iterator]() {
    return this;
  }

  private reset() {
    this.fields.length = 0;
    this.state = ParserState.START_RECORD;
    this.numericField = false;
  }

  private processChar(c: string, chars: HasNextIterator<string>) {
    const dialect = this.dialect;

    switch (this.state) {
      case ParserState.START_RECORD:
        // start of record
        if (endOfRecord(c)) {
          // empty line - return []
          break;
        }
        // normal character - handle as START_FIELD
        this.state = ParserState.START_FIELD;
        this.processChar(c, chars);
        break;

      case ParserState.START_FIELD:
        // expecting field
        if (endOfRecord(c)) {
          // save empty field - return [fields]
          this.saveField();
          this.state = ParserState.START_RECORD;
        } else if (
            c === dialect.quoteChar && dialect.quoting !== Quoting.NONE) {
          // start quoted field
          this.state = ParserState.IN_QUOTED_FIELD;
        } else if (c === dialect.escapeChar) {
          // possible escaped character
          this.state = ParserState.ESCAPED_CHAR;
        } else if (c === ' ' && dialect.skipInitialSpace) {
          // ignore space at start of field
        } else if (c === dialect.delimiter) {
          // save empty field
          this.saveField();
        } else {
          // begin new unquoted field
          if (dialect.quoting === Quoting.NON_NUMERIC) {
            this.numericField = true;
          }
          this.addChar(c);
          this.state = ParserState.IN_FIELD;
        }
        break;

      case ParserState.ESCAPED_CHAR:
        if (endOfRecord(c)) {
          this.addChar(c);
          this.state = ParserState.AFTER_ESCAPED_CRLF;
          break;
        }
        this.addChar(c);
        this.state = ParserState.IN_FIELD;
        break;

      case ParserState.AFTER_ESCAPED_CRLF:
        if (endOfRecord(c)) {
          break;
        }
        this.state = ParserState.IN_FIELD;
        this.processChar(c, chars);
        break;

      case ParserState.IN_FIELD:
        // in unquoted field
        if (endOfRecord(c)) {
          // end of line - return [fields]
          this.saveField();
          this.state = ParserState.START_RECORD;
        } else if (c === dialect.escapeChar) {
          // possible escaped character
          this.state = ParserState.ESCAPED_CHAR;
        } else if (c === dialect.delimiter) {
          // save field - wait for new field
          this.saveField();
          this.state = ParserState.START_FIELD;
        } else {
          // normal character - save in field
          this.addChar(c);
        }
        break;

      case ParserState.IN_QUOTED_FIELD:
        // in quoted field
        if (endOfData(chars, this.lines)) {
          // skip this character
        } else if (c === dialect.escapeChar) {
          // Possible escape character
          this.state = ParserState.ESCAPE_IN_QUOTED_FIELD;
        } else if (
            c === dialect.quoteChar && dialect.quoting !== Quoting.NONE) {
          if (dialect.doubleQuote) {
            // doublequote; " represented by ""
            this.state = ParserState.QUOTE_IN_QUOTED_FIELD;
          } else {
            // end of quote part of field
            this.state = ParserState.IN_FIELD;
          }
        } else {
          // normal character - save in field
          this.addChar(c);
        }
        break;

      case ParserState.ESCAPE_IN_QUOTED_FIELD:
        this.addChar(c);
        this.state = ParserState.IN_QUOTED_FIELD;
        break;

      case ParserState.QUOTE_IN_QUOTED_FIELD:
        // doublequote - seen a quote in an quoted field
        if (dialect.quoting !== Quoting.NONE && c === dialect.quoteChar) {
          // save "" as "
          this.addChar(c);
          this.state = ParserState.IN_QUOTED_FIELD;
        } else if (c === dialect.delimiter) {
          // save field - wait for new field
          this.saveField();
          this.state = ParserState.START_FIELD;
        } else if (endOfRecord(c)) {
          // end of line - return [fields]
          this.saveField();
          this.state = ParserState.START_RECORD;
        } else if (!dialect.strict) {
          this.addChar(c);
          this.state = ParserState.IN_FIELD;
        } else {
          // illegal
          this.error(
              `"${dialect.delimiter}" expected after "${dialect.quoteChar}"`);
        }
        break;

      default:
        break;
    }
  }

  private addChar(c: string) {
    this.field += c;
  }

  private saveField() {
    let field: Field = this.field;
    if (this.numericField) {
      this.numericField = false;
      const f = Number(field);
      if (isNaN(f)) {
        this.error(`could not convert string to number: ${field}`);
      }
      field = f;
    }
    this.fields.push(field);
    this.field = '';
  }

  private error(message: string) {
    throw new Error(`${message}, at line ${this.lineNum}`);
  }
}

function endOfRecord(c: string): boolean {
  return (c === '\n' || c === '\r');
}

function endOfData(
    chars: HasNextIterator<string>, lines: HasNextIterator<string>): boolean {
  return !chars.hasNext() && !lines.hasNext();
}

function zip<T, U>(a: T[], b: U[]): Array<[T, U]> {
  return a.map((v, i) => [v, b[i]]);
}

function* splitLines(s: string): Generator<string> {
  const re = /\r\n|\r|\n/g;
  let result;
  let start = 0;
  while (result = re.exec(s)) {
    yield s.substring(start, result.index + result[0].length);
    start = re.lastIndex;
  }
}
