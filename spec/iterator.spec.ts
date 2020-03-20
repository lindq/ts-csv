import {HasNextIterator} from '../src/iterator';

describe('HasNextIterator', () => {
  it('should report hasNext', () => {
    const iterator = new HasNextIterator('foo');
    expect(iterator.hasNext()).toBe(true);
    expect(iterator.next()).toEqual({value: 'f', done: false});
    expect(iterator.hasNext()).toBe(true);
    expect(iterator.next()).toEqual({value: 'o', done: false});
    expect(iterator.hasNext()).toBe(true);
    expect(iterator.next()).toEqual({value: 'o', done: false});
    expect(iterator.hasNext()).toBe(false);
  });

  it('should not advance the iterator on multiple hasNext calls', () => {
    const iterator = new HasNextIterator('foo');
    iterator.hasNext();
    iterator.hasNext();
    iterator.hasNext();
    expect(iterator.next()).toEqual({value: 'f', done: false});
  });

  it('should report undefined for exhausted iterable', () => {
    const iterator = new HasNextIterator('');
    expect(iterator.hasNext()).toBe(false);
    const {value, done} = iterator.next();
    expect(value).toBeUndefined();
    expect(done).toBe(true);
  });

  it('should be an iterable iterator', () => {
    const iterator = new HasNextIterator('123');
    expect([...iterator]).toEqual(['1', '2', '3']);
  });
});
