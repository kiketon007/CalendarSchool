import { describe, expect, it } from 'vitest';
import { pageCountOf, paginate } from './pagination';

const numbers = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

describe('pageCountOf', () => {
  it.each([
    [0, 1],
    [1, 1],
    [20, 1],
    [21, 2],
    [40, 2],
    [45, 3],
    [60, 3],
  ])('gives %i items %i page(s) of 20', (total, expected) => {
    expect(pageCountOf(total, 20)).toBe(expected);
  });
});

describe('paginate', () => {
  it('returns the first page', () => {
    expect(paginate(numbers(45), 1, 20)).toEqual(numbers(20));
  });

  it('returns an intermediate page', () => {
    expect(paginate(numbers(45), 2, 20)).toEqual(numbers(40).slice(20));
  });

  it('returns the incomplete last page', () => {
    expect(paginate(numbers(45), 3, 20)).toEqual([41, 42, 43, 44, 45]);
  });

  it('returns everything when there are exactly as many items as the page size', () => {
    expect(paginate(numbers(20), 1, 20)).toEqual(numbers(20));
  });

  it('returns an empty list for an empty list', () => {
    expect(paginate([], 1, 20)).toEqual([]);
  });

  it.each([0, -3, Number.NaN])('treats page %s as the first one', (page) => {
    expect(paginate(numbers(45), page, 20)).toEqual(numbers(20));
  });

  it('treats a page past the end as the last one, never as an empty page', () => {
    expect(paginate(numbers(45), 9, 20)).toEqual([41, 42, 43, 44, 45]);
  });

  it('does not change the list it receives', () => {
    const items = numbers(25);
    paginate(items, 2, 20);

    expect(items).toEqual(numbers(25));
  });
});
