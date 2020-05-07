# ts-csv

A TypeScript CSV reader/writer based on the CPython implementation.

## Usage

### Reading

```
[...reader(csv)];  // [['header 1', 'header 2'], ['value1', 'value2']]
[...recordReader(csv)];  // [{'header 1': 'value1', 'header 2': 'value2'}]
```

### Writing

```
[...writer(rows)].join('');  // "header 1,header 2\r\nvalue1,value2\r\n"
[...recordWriter(rowObjs)].join('');
```

See code comments and tests for more options and examples.
