import {Dialect, excel, Quoting, unix} from '../src/dialect';
import {reader, Reader, recordReader, Row} from '../src/reader';

describe('CSV Reader', () => {
  function readTest(
      source: string, expected: Row[], dialectOptions?: Partial<Dialect>) {
    const dialect = {...excel, ...dialectOptions};
    expect([...reader(source, dialect)]).toEqual(expected);
  }

  it('should be an iterator', () => {
    const reader = new Reader('');
    expect(typeof reader[Symbol.iterator]).toEqual('function');
  });

  it('should have default dialect properties', () => {
    const dialect = new Reader('').dialect;
    expect(dialect.delimiter).toEqual(',');
    expect(dialect.doubleQuote).toBe(true);
    expect(dialect.escapeChar).toBeUndefined();
    expect(dialect.lineTerminator).toEqual('\r\n');
    expect(dialect.quoteChar).toEqual('"');
    expect(dialect.quoting).toEqual(Quoting.MINIMAL);
    expect(dialect.skipInitialSpace).toBe(false);
    expect(dialect.strict).toBe(false);
  });

  it('should override dialect properties', () => {
    const opts = {
      delimiter: ':',
      doubleQuote: false,
      escapeChar: '\\',
      lineTerminator: '\r',
      quoteChar: '*',
      quoting: Quoting.NONE,
      skipInitialSpace: true,
      strict: true
    };
    const reader = new Reader('', opts);
    const dialect = reader.dialect;
    expect(dialect.delimiter).toEqual(':');
    expect(dialect.doubleQuote).toBe(false);
    expect(dialect.escapeChar).toEqual('\\');
    expect(dialect.lineTerminator).toEqual('\r');
    expect(dialect.quoteChar).toEqual('*');
    expect(dialect.quoting).toEqual(Quoting.NONE);
    expect(dialect.skipInitialSpace).toBe(true);
    expect(dialect.strict).toBe(true);
  });

  it('should read odd inputs', () => {
    readTest('', []);
    expect(() => {
      readTest('"ab"c', [], {strict: true});
    }).toThrowError('"," expected after """, at line 1');
    expect(() => {
      readTest('ab\0c', [], {strict: true});
    }).toThrowError('line contains NULL byte, at line 1');
    readTest('"ab"c', [['abc']], {doubleQuote: false});
  });

  it('should recognize end-of-line', () => {
    readTest('a,b', [['a', 'b']]);
    readTest('a,b\n', [['a', 'b']]);
    readTest('a,b\r\n', [['a', 'b']]);
    readTest('a,b\r', [['a', 'b']]);
    readTest('a,b\rc,d', [['a', 'b'], ['c', 'd']]);
    readTest('a,b\nc,d', [['a', 'b'], ['c', 'd']]);
    readTest('a,b\r\nc,d', [['a', 'b'], ['c', 'd']]);
  });

  it('should handle truncated input', () => {
    readTest('a,"', [['a', '']]);
    readTest('"a', [['a']]);
    expect(() => {
      readTest('a,"', [], {strict: true});
    }).toThrowError('unexpected end of data, at line 1');
    expect(() => {
      readTest('"a', [], {strict: true});
    }).toThrowError('unexpected end of data, at line 1');
    expect(() => {
      readTest('^', [], {escapeChar: '^', strict: true});
    }).toThrowError('unexpected end of data, at line 1');
  });

  it('should handle escape characters', () => {
    readTest('a,\\b,c', [['a', 'b', 'c']], {escapeChar: '\\'});
    readTest('a,b\\,c', [['a', 'b,c']], {escapeChar: '\\'});
    readTest('a,"b\\,c"', [['a', 'b,c']], {escapeChar: '\\'});
    readTest('a,"b,\\c"', [['a', 'b,c']], {escapeChar: '\\'});
    readTest('a,"b,c\\""', [['a', 'b,c"']], {escapeChar: '\\'});
    readTest('a,"b,c"\\', [['a', 'b,c\\']], {escapeChar: '\\'});
  });

  it('should handle quoting', () => {
    readTest('1,",3,",5', [['1', ',3,', '5']]);
    readTest(
        '1,",3,",5', [['1', '"', '3', '"', '5']],
        {quoteChar: undefined, escapeChar: '\\'});
    readTest(
        '1,",3,",5', [['1', '"', '3', '"', '5']],
        {quoting: Quoting.NONE, escapeChar: '\\'});
    readTest(
        ',3,"5",7.3, 9', [['', 3, '5', 7.3, 9]],
        {quoting: Quoting.NON_NUMERIC});
    readTest('"a\nb", 7', [['a\nb', ' 7']]);
    expect(() => {
      readTest('abc,3', [], {quoting: Quoting.NON_NUMERIC});
    }).toThrowError('could not convert string to number: abc, at line 1');
  });

  it('should report the line number', () => {
    const reader = new Reader('line,1\r\nline,2\r\nline,3');
    expect(reader.lineNum).toEqual(0);
    reader.next();
    expect(reader.lineNum).toEqual(1);
    reader.next();
    expect(reader.lineNum).toEqual(2);
    reader.next();
    expect(reader.lineNum).toEqual(3);
    expect(reader.next()).toEqual({value: [], done: true});
    expect(reader.lineNum).toEqual(3);
  });

  describe('Excel Dialect', () => {
    it('should read a single field', () => {
      readTest('abc', [['abc']]);
    });

    it('should read multiple fields', () => {
      readTest('1,2,3,4,5', [['1', '2', '3', '4', '5']]);
    });

    it('should read an empty string', () => {
      readTest('', []);
    });

    it('should read empty fields', () => {
      readTest(',', [['', '']]);
    });

    it('should read a single quoted field', () => {
      readTest('""', [['']]);
    });

    it('should read a quoted field followed by an empty field', () => {
      readTest('"",', [['', '']]);
    });

    it('should read an empty field followed by a quoted field', () => {
      readTest(',""', [['', '']]);
    });

    it('should read a quoted quote', () => {
      readTest('""""', [['"']]);
    });

    it('should read adjacent quoted quotes', () => {
      readTest('""""""', [['""']]);
    });

    it('should read an inline quoted quote', () => {
      readTest('a""b', [['a""b']]);
    });

    it('should read multiple inline quotes', () => {
      readTest('a"b"c', [['a"b"c']]);
    });

    it('should read quoted character followed by unquoted', () => {
      readTest('"a"b', [['ab']]);
    });

    it('should read a single inline quote', () => {
      readTest('a"b', [['a"b']]);
    });

    it('should read adjacent quotes characters', () => {
      readTest('"a" "b"', [['a "b"']]);
    });

    it('should read a quoted character after a space', () => {
      readTest(' "a"', [[' "a"']]);
    });

    it('should read a quoted field with delimiter', () => {
      readTest('1,2,3,"a, b",5,6', [['1', '2', '3', 'a, b', '5', '6']]);
    });

    it('should read a quoted field with quotes and delimiter', () => {
      readTest('1,2,3,"""a,"" b","c"', [['1', '2', '3', '"a," b', 'c']]);
    });

    it('should read a quoted field with newline', () => {
      readTest(
          '1,2,3,"""a,""\nb","c\nd"\n9,8,7,6',
          [['1', '2', '3', '"a,"\nb', 'c\nd'], ['9', '8', '7', '6']]);
    });

    it('should read unmatched quotes', () => {
      readTest('12,12,1",', [['12', '12', '1"', '']]);
    });

    it('should read escaped delimiter', () => {
      readTest(
          'abc\\,def\r\n', [['abc,def']],
          {quoting: Quoting.NONE, escapeChar: '\\'});
    });

    it('should read escaped delimiter in quoted field', () => {
      readTest(
          '"abc\\,def"\r\n', [['abc,def']],
          {quoting: Quoting.NON_NUMERIC, escapeChar: '\\'});
    });
  });

  describe('Unix Dialect', () => {
    it('should read all quoted fields', () => {
      readTest('"1","abc def","abc"\n', [['1', 'abc def', 'abc']], unix);
    });
  });

  describe('recordReader', () => {
    it('should read header fields from first row by default', () => {
      const csv = 'a,b,c\r\n1,2,3\n4,5,6';
      const expected = [
        {a: '1', b: '2', c: '3'},
        {a: '4', b: '5', c: '6'},
      ];
      expect([...recordReader(csv)]).toEqual(expected);
    });

    it('should read header fields from argument', () => {
      const csv = '1,2,3\n4,5,6';
      const fields = ['a', 'c', 'e'];
      const expected = [
        {a: '1', c: '2', e: '3'},
        {a: '4', c: '5', e: '6'},
      ];
      expect([...recordReader(csv, excel, {fields})]).toEqual(expected);
    });

    it('should return an empty array when no data', () => {
      expect([...recordReader('')]).toEqual([]);
    });

    it('should skip blank rows', () => {
      const csv = 'x,y,z\r\n\r\n1,2,3\r\n';
      const fields = ['a', 'b', 'c'];
      const expected = [
        {a: 'x', b: 'y', c: 'z'},
        {a: '1', b: '2', c: '3'},
      ];
      expect([...recordReader(csv, excel, {fields})]).toEqual(expected);
    });

    it('should read extra values to default restkey', () => {
      const csv = 'a,b,c\r\n1,2,3,4,5,6\r\n7,8,9,x,y';
      const expected = [
        {a: '1', b: '2', c: '3', undefined: ['4', '5', '6']},
        {a: '7', b: '8', c: '9', undefined: ['x', 'y']},
      ];
      expect([...recordReader(csv)]).toEqual(expected);
    });

    it('should read extra values to given restkey', () => {
      const csv = 'a,b,c\r\n1,2,3,4,5,6\r\n7,8,9,x,y';
      const restkey = '_rest';
      const expected = [
        {a: '1', b: '2', c: '3', '_rest': ['4', '5', '6']},
        {a: '7', b: '8', c: '9', '_rest': ['x', 'y']},
      ];
      expect([...recordReader(csv, excel, {restkey})]).toEqual(expected);
    });

    it('should read default restval into short rows', () => {
      const csv = 'a,b,c,d,e,f\r\n1,2,3\n4,5,6';
      const expected = [
        {a: '1', b: '2', c: '3', d: '', e: '', f: ''},
        {a: '4', b: '5', c: '6', d: '', e: '', f: ''},
      ];
      expect([...recordReader(csv)]).toEqual(expected);
    });

    it('should read given restval into short rows', () => {
      const csv = 'a,b,c,d,e,f\r\n1,2,3\n4,5,6';
      const restval = '\0';
      const expected = [
        {a: '1', b: '2', c: '3', d: '\0', e: '\0', f: '\0'},
        {a: '4', b: '5', c: '6', d: '\0', e: '\0', f: '\0'},
      ];
      expect([...recordReader(csv, excel, {restval})]).toEqual(expected);
    });
  });
});
