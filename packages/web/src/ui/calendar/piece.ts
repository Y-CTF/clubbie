/**
 * The four sizes an event is drawn at, and the classes each one carries.
 *
 * They are one list rather than four components because they are one thing seen from four
 * distances: the same colour, the same marks for cancelled, draft and past, the same click. What
 * differs is how much room there is to say it in, which is a class, not a component.
 *
 * Two of them carry the colour as a dot beside the title and two as a surface behind it. That is
 * not a style choice: a bar and a block are saying how many days or how much of an evening
 * something takes, and only an area can say that. Everything else is a dot and a word.
 */
export const Shape = {
  /** One line in a month cell: a dot of colour, a clock, a title. */
  Chip: 'chip',
  /** A bar across the days a thing covers, in the row above a grid. */
  Bar: 'bar',
  /** A box in a day column, as tall as the event is long. */
  Block: 'block',
  /** A line of the list, which is the one place there is room for the whole sentence. */
  Row: 'row',
} as const;

export type Shape = (typeof Shape)[keyof typeof Shape];

export const SHAPES: Record<Shape, string> = {
  chip: 'piece',
  bar: 'piece piece-bar',
  block: 'piece piece-block',
  row: 'piece piece-row',
};

/** Which shapes wear the colour as a dot. The other two wear it as the surface they are drawn on. */
export const DOTTED: readonly Shape[] = [Shape.Chip, Shape.Row];
