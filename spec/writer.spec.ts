import {Dialect, excel, Quoting, unix} from '../src/dialect';
import {recordWriter, Row, writer} from '../src/writer';

describe('CSV Writer', () => {
  function writeRowTest(
      row: Row, expected: string, dialectOptions?: Partial<Dialect>) {
    writeRowsTest([row], expected + '\r\n', dialectOptions);
  }

  function writeRowsTest(
      rows: Row[], expected: string, dialectOptions?: Partial<Dialect>) {
    const dialect = {...excel, ...dialectOptions};
    const csv = [...writer(rows, dialect)].join('');
    expect(csv).toEqual(expected);
  }

  it('should return an iterator', () => {
    const rows = [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
    ];
    const gen = writer(rows);
    expect(gen.next()).toEqual({value: 'a,b,c\r\n', done: false});
    expect(gen.next()).toEqual({value: 'd,e,f\r\n', done: false});
    expect(gen.next()).toEqual({value: 'g,h,i\r\n', done: false});
    expect(gen.next()).toEqual({value: undefined, done: true});
  });

  it('should write quoted fields', () => {
    writeRowTest(['a', 1, 'p,q'], 'a,1,"p,q"');
    expect(() => {
      writeRowTest(['a', 1, 'p,q'], '', {quoting: Quoting.NONE});
    }).toThrowError('need to escape, but no escapeChar set');
    writeRowTest(['a', 1, 'p,q'], 'a,1,"p,q"', {quoting: Quoting.MINIMAL});
    writeRowTest(
        ['a', 1, 'p,q'], '"a",1,"p,q"', {quoting: Quoting.NON_NUMERIC});
    writeRowTest(['a', 1, 'p,q'], '"a","1","p,q"', {quoting: Quoting.ALL});
    writeRowTest(['a\nb', 1], '"a\nb","1"', {quoting: Quoting.ALL});
    writeRowTest([''], '""', {quoting: Quoting.MINIMAL});
    expect(() => {
      writeRowTest([''], '', {quoting: Quoting.NONE});
    }).toThrowError('single empty field record must be quoted');
  });

  it('should write fields containing escape characters', () => {
    writeRowTest(['a', 1, 'p,q'], 'a,1,"p,q"', {escapeChar: '\\'});
    expect(() => {
      writeRowTest(
          ['a', 1, 'p,"q"'], '', {escapeChar: undefined, doubleQuote: false});
    }).toThrowError('need to escape, but no escapeChar set');
    writeRowTest(
        ['a', 1, 'p,"q"'], 'a,1,"p,\\"q\\""',
        {escapeChar: '\\', doubleQuote: false});
    writeRowTest(['"'], '""""', {escapeChar: '\\', quoting: Quoting.MINIMAL});
    writeRowTest(
        ['"'], '\\"',
        {escapeChar: '\\', quoting: Quoting.MINIMAL, doubleQuote: false});
    writeRowTest(['"'], '\\"', {escapeChar: '\\', quoting: Quoting.NONE});
    writeRowTest(
        ['a', 1, 'p,q'], 'a,1,p\\,q',
        {escapeChar: '\\', quoting: Quoting.NONE});
  });

  it('should write multiple rows', () => {
    writeRowsTest([['a', 'b'], ['c', 'd']], 'a,b\r\nc,d\r\n');
  });

  describe('Excel Dialect', () => {
    it('should write empty row', () => {
      writeRowsTest([], '');
    });

    it('should write a single field row', () => {
      writeRowTest(['abc'], 'abc');
    });

    it('should write a multiple field row', () => {
      writeRowTest([1, 2, 'abc', 3, 4], '1,2,abc,3,4');
    });

    it('should write inline quotes', () => {
      writeRowTest([1, 2, 'a"bc"', 3, 4], '1,2,"a""bc""",3,4');
    });

    it('should write quoted field with delimiter', () => {
      writeRowTest(['abc,def'], '"abc,def"');
    });

    it('should write quoted field with newline', () => {
      writeRowTest([1, 2, 'a\nbc', 3, 4], '1,2,"a\nbc",3,4');
    });

    it('should write escaped delimiter without quoting', () => {
      writeRowTest(
          ['abc,def'], 'abc\\,def', {escapeChar: '\\', quoting: Quoting.NONE});
    });

    it('should write delimiter with quoting', () => {
      writeRowTest(
          ['abc,def'], '"abc,def"',
          {escapeChar: '\\', quoting: Quoting.NON_NUMERIC});
    });
  });

  describe('Unix Dialect', () => {
    it('should write all quoted fields', () => {
      writeRowsTest([[1, 'abc def', 'abc']], '"1","abc def","abc"\n', unix);
    });
  });

  describe('recordWriter', () => {
    it('should read headers from data', () => {
      const rows = [{first: 'A'}, {first: 'C'}, {first: 'E'}];
      const expected = 'first\r\nA\r\nC\r\nE\r\n';
      const csv = [...recordWriter(rows)].join('');
      expect(csv).toEqual(expected);
    });

    it('should read headers from parameter', () => {
      const rows = [
        {first: 'A', second: 'B'},
        {first: 'C', second: 'D'},
        {first: 'E', second: 'F'},
      ];
      const expected = 'second,first\r\nB,A\r\nD,C\r\nF,E\r\n';
      const csv = [...recordWriter(rows, ['second', 'first'])].join('');
      expect(csv).toEqual(expected);
    });

    it('should write empty strings for missing fields', () => {
      const rows = [{first: 'A', second: 'B'}, {second: 'D'}, {first: 'E'}];
      const expected = 'first,second\r\nA,B\r\n,D\r\nE,\r\n';
      const csv = [...recordWriter(rows, ['first', 'second'])].join('');
      expect(csv).toEqual(expected);
    });
  });
});
