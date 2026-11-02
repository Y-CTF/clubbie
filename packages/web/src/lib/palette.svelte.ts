/** Whether the command palette is open. One flag, so the sidebar button and the keyboard agree. */
export class Palette {
  open = $state(false);

  toggle(): void {
    this.open = !this.open;
  }
}

export const palette = new Palette();
