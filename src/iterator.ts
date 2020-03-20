/**
 * An iterator with the ability to determine if subsequent calls to next() will
 * yield a value by means of a hasNext() method.
 */
export class HasNextIterator<T> implements IterableIterator<T> {
  private readonly iterator: Iterator<T>;
  private readonly nextValues: T[] = [];

  constructor(readonly iterable: Iterable<T>) {
    this.iterator = iterable[Symbol.iterator]();
  }

  next(): IteratorResult<T> {
    return this.nextValues.length ?
        {value: this.nextValues.shift() as T, done: false} :
        this.iterator.next();
  }

  [Symbol.iterator]() {
    return this;
  }

  hasNext(): boolean {
    if (this.nextValues.length) {
      return true;
    }
    const {value, done} = this.next();
    if (!done) {
      this.nextValues.push(value);
    }
    return !done;
  }
}
