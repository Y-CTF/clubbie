<script lang="ts">
import { type Act, ACTS, Audit, type Admission, Club, Design, type Font, type Language, LOCALES, type Palette, type Width } from '@clubbie/core';
import { Action } from '../lib/action.svelte.ts';
import { api, unwrap } from '../lib/api.ts';
import { club } from '../lib/club.svelte.ts';
import { Format } from '../lib/format.ts';
import { kinds as vocabulary } from '../lib/kinds.svelte.ts';
import { Query } from '../lib/query.svelte.ts';
import { words, Words } from '../lib/words/index.svelte.ts';
import Alert from '../ui/Alert.svelte';
import Button from '../ui/Button.svelte';
import Danger from '../ui/Danger.svelte';
import Field from '../ui/Field.svelte';
import Input from '../ui/Input.svelte';
import Pager from '../ui/Pager.svelte';
import Panel from '../ui/Panel.svelte';
import Picture from '../ui/Picture.svelte';
import Scale from '../ui/Scale.svelte';
import Select from '../ui/Select.svelte';
import { Marks } from '../ui/marks.ts';
import Tags from '../ui/Tags.svelte';

/**
 * Everything about the deployment that is the club's to change: who it is, what it looks like, who
 * may join it, and what language it writes in.
 *
 * It is one page with sections rather than several pages, because a committee opens it once a term
 * and wants to see the whole thing at once, and because every one of these is the same write. The
 * queue is not here for the opposite reason: nothing on it is saved, and it moves while it is read.
 */
const identity = new Query(async () => unwrap(await api.club.$get()));
/** Which acts the trail is showing. Empty is all of them, which is what it opens on. */
let act = $state<Act | ''>('');

/** Filtering is a different report, so it starts at its own first page rather than page four. */
function filter(chosen: Act | ''): void {
  act = chosen;
  done = 0;
}

const trail = new Query(async () =>
  unwrap(
    await api.audit.$get({
      query: { limit: String(Audit.WINDOW), offset: String(done), ...(act === '' ? {} : { act }) },
    }),
  ),
);

/**
 * What a detail's value reads as. The column holds whatever the act recorded, which is a string,
 * a number, a flag, or the before-and-after of a membership; none of those is worth its JSON.
 */
function stringify(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return Object.values(value).join(' → ');
  return String(value);
}
/** Where the trail is: it grows forever, and is read newest first. */
let done = $state(0);
/** What this deployment actually configured, which is what a club may pick from. */
const configured = new Query(async () => unwrap(await api.auth.providers.$get()));
const action = new Action();
const t = $derived(words.t);

let name = $state('');
let tagline = $state('');
let logo = $state('');
let listed = $state(false);
let locale = $state<Language | ''>('');
let timezone = $state('');

let accent = $state(Design.ACCENT);
let paper = $state<string | null>(null);
let palette = $state<Palette>(Design.PALETTE);
let font = $state<Font>(Design.FONT);
let display = $state<Font>(Design.DISPLAY);
let width = $state<Width>(Design.WIDTH);
let corner = $state(Design.CORNER.value);
let space = $state(Design.SPACE.value);
let hue = $state(Design.HUE.value);
let tint = $state(Design.TINT.value);
let scale = $state(Design.SCALE.value);
let motion = $state(Design.MOTION);
let links = $state<{ label: string; url: string }[]>([]);
let banner = $state('');
let blurb = $state('');
let footer = $state('');
let organisations = $state<string[]>([]);
let domains = $state<string[]>([]);
let allowed = $state<string[]>([]);
let blocked = $state<string[]>([]);
let providers = $state<string[]>([]);
let deadline = $state(Club.DEADLINE);
let remind = $state(Club.REMIND);
let guests = $state(Club.GUESTS);
let waitlist = $state(Club.WAITLIST);
let admission = $state<Admission>(Club.ADMISSION);

$effect(() => {
  void identity.load().then(fill);
  void act;
  void done;
  trail.load();
  configured.load();
  vocabulary.load();
});

/** The club's own words for its evenings. Each row saves itself: they are not part of the form. */
let adding = $state('');
/** The link being composed, which is added to the list rather than typed into a blank row in it. */
let pending = $state({ label: '', url: '' });

/**
 * A link is added to the form rather than to the club: it is saved with everything else on this
 * page, which is why this one takes no `Action` and the kind beside it does. A kind is a row of
 * its own with events filed under it, and it is written the moment it is named.
 */
function addLink(): void {
  const label = pending.label.trim();
  const url = pending.url.trim();
  if (!label || !url) return;

  links = [...links, { label, url }];
  pending = { label: '', url: '' };
}

async function addKind(): Promise<void> {
  const label = adding.trim();
  if (!label) return;

  if (await action.run(async () => unwrap(await api.kinds.$post({ json: { label } })))) {
    adding = '';
    await vocabulary.load(true);
  }
}

async function renameKind(id: string, label: string): Promise<void> {
  const wanted = label.trim();
  if (!wanted || wanted === vocabulary.label(id)) return;

  await action.run(async () => unwrap(await api.kinds[':id'].$patch({ param: { id }, json: { label: wanted } })));
  await vocabulary.load(true);
}

async function removeKind(id: string): Promise<void> {
  if (await action.run(async () => unwrap(await api.kinds[':id'].$delete({ param: { id } })))) {
    await vocabulary.load(true);
  }
}

function fill(): void {
  const current = identity.data;
  if (!current) return;

  name = current.name;
  tagline = current.tagline ?? '';
  logo = current.logo ?? '';
  listed = current.listed;
  locale = current.locale ?? '';
  timezone = current.timezone ?? '';

  accent = current.design.accent;
  paper = current.design.paper;
  palette = current.design.palette;
  font = current.design.font;
  display = current.design.display;
  width = current.design.width;
  corner = current.design.corner;
  space = current.design.space;
  hue = current.design.hue;
  tint = current.design.tint;
  scale = current.design.scale;
  motion = current.design.motion;
  links = current.design.links.map((one) => ({ ...one }));
  banner = current.design.banner ?? '';
  blurb = current.design.blurb ?? '';
  footer = current.design.footer ?? '';
  organisations = [...(current.organisations ?? [])];
  domains = [...(current.domains ?? [])];
  allowed = [...(current.allowed ?? [])];
  blocked = [...(current.blocked ?? [])];
  providers = [...(current.providers ?? [])];
  deadline = current.deadline;
  remind = current.remind;
  guests = current.guests;
  waitlist = current.waitlist;
  admission = current.admission ?? Club.ADMISSION;
}

/** One save for the whole page: every section writes the same row. */
async function save(): Promise<void> {
  const saved = await action.run(async () =>
    unwrap(
      await api.club.$patch({
        json: {
          name,
          tagline: tagline || null,
          logo: logo || null,
          listed,
          locale: locale || null,
          timezone: timezone || null,
          accent,
          paper,
          palette,
          font,
          display,
          width,
          corner,
          space,
          hue,
          tint,
          scale,
          motion,
          /** A half-typed link is not a link: only rows with both halves are sent. */
          links: links.filter((one) => one.label.trim() !== '' && one.url.trim() !== ''),
          banner: banner || null,
          blurb: blurb || null,
          footer: footer || null,
          organisations,
          domains,
          allowed,
          blocked,
          providers,
          admission,
          deadline,
          remind,
          guests,
          waitlist,
        },
      }),
    ),
  );
  if (!saved) return;

  await identity.load();
  /** The look is applied from the club's own answer, so saving is also the preview. */
  await club.load();
}
</script>

<h1 class="font-semibold">{t.pages.Settings}</h1>

<Panel query={identity}>
  <div class="mt-6 grid gap-4">
    <Field label={t.settings.name}><Input bind:value={name} /></Field>

    <Field label={t.settings.tagline} hint={t.settings.taglineHint}>
      <Input bind:value={tagline} />
    </Field>

    <Picture bind:value={logo} label={t.design.logo} hint={t.design.logoHint} />

    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" bind:checked={listed} />
      {t.settings.listed}
    </label>
  </div>
</Panel>

<section class="mt-10 border-t border-line pt-8">
  <h2 class="font-medium">{t.design.heading}</h2>
  <p class="mt-1 text-xs text-muted">{t.design.hint}</p>

  <div class="mt-4 grid gap-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <Field label={t.design.accent} hint={t.design.accentHint}>
        <span class="flex items-center gap-3">
          <input type="color" bind:value={accent} class="h-11 w-16 border border-line" />
          <span class="font-mono text-xs text-muted">{accent}</span>
        </span>
      </Field>

      <Field label={t.design.paper} hint={t.design.paperHint}>
        <span class="flex items-center gap-3">
          <input
            type="color"
            value={paper ?? '#ffffff'}
            onchange={(event) => (paper = event.currentTarget.value)}
            class="h-11 w-16 border border-line"
          />
          {#if paper === null}
            <span class="text-xs text-muted">{t.design.paperAuto}</span>
          {:else}
            <span class="font-mono text-xs text-muted">{paper}</span>
            <Button look="plain" onclick={() => (paper = null)}>{t.common.clear}</Button>
          {/if}
        </span>
      </Field>

      <Field label={t.design.palette}>
        <Select bind:value={palette} options={Design.PALETTES} name={(one) => t.palettes[one]} />
      </Field>

      <Field label={t.design.font}>
        <Select bind:value={font} options={Design.FONTS} name={(one) => t.fonts[one]} />
      </Field>

      <Field label={t.design.display} hint={t.design.displayHint}>
        <Select bind:value={display} options={Design.FONTS} name={(one) => t.fonts[one]} />
      </Field>

      <Field label={t.design.width}>
        <Select bind:value={width} options={Design.WIDTHS} name={(one) => t.widths[one]} />
      </Field>

      <Field label={t.design.scale} hint={t.design.scaleHint}>
        <Scale bind:value={scale} range={Design.SCALE} unit="%" />
      </Field>

      <Field label={t.design.corner} hint={t.design.cornerHint}>
        <Scale bind:value={corner} range={Design.CORNER} unit="px" />
      </Field>

      <Field label={t.design.space} hint={t.design.spaceHint}>
        <Scale bind:value={space} range={Design.SPACE} unit="%" />
      </Field>

      <Field label={t.design.hue} hint={t.design.hueHint}>
        <Scale bind:value={hue} range={Design.HUE} unit="°" />
      </Field>

      <Field label={t.design.tint} hint={t.design.tintHint}>
        <Scale bind:value={tint} range={Design.TINT} />
      </Field>
    </div>

    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" bind:checked={motion} />
      {t.design.motion}
    </label>

    <Picture bind:value={banner} label={t.design.banner} hint={t.design.bannerHint} wide />

    <Field label={t.design.blurb} hint={t.design.blurbHint}>
      <textarea
        bind:value={blurb}
        rows="3"
        maxlength={Design.BLURB}
        class="w-full rounded-lg border border-line bg-transparent px-3 py-2.5 text-base
               transition-colors hover:border-muted"
      ></textarea>
    </Field>

    <Field label={t.design.footer} hint={t.design.footerHint}>
      <Input bind:value={footer} maxlength={Design.FOOTER} />
    </Field>
  </div>
</section>

<section class="mt-10 border-t border-line pt-8">
  <h2 class="font-medium">{t.design.links}</h2>
  <p class="mt-1 text-xs text-muted">{t.design.linksHint}</p>

  <!--
    The same shape as the kinds below: a column of what there is, and one row at the bottom to add
    to it. The two lists were written differently, one appending a blank row to fill in and the
    other composing in place, which made adding a link and adding a kind feel like different acts.
  -->
  <ul class="mt-4 grid gap-2">
    {#each links as link, index (index)}
      <li class="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_7rem] items-center gap-2">
        <Input bind:value={link.label} placeholder={t.design.linkLabel} aria-label={t.design.linkLabel} />
        <Input
          bind:value={link.url}
          placeholder="https://"
          aria-label={t.design.linkUrl}
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
        />
        <Button look="plain" field onclick={() => (links = links.filter((_, at) => at !== index))}>
          {t.common.remove}
        </Button>
      </li>
    {/each}
  </ul>

  {#if links.length < Design.LINKS}
    <!-- The same three columns as a row above it, in fixed widths: `auto` sizes each grid alone. -->
    <div class="mt-2 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_7rem] items-center gap-2">
      <Input bind:value={pending.label} placeholder={t.design.linkLabel} aria-label={t.design.linkLabel} />
      <Input
        bind:value={pending.url}
        placeholder="https://"
        aria-label={t.design.linkUrl}
        autocapitalize="none"
        autocorrect="off"
        spellcheck="false"
      />
      <Button field disabled={!pending.label.trim() || !pending.url.trim()} onclick={addLink}>
        {t.common.add}
      </Button>
    </div>
  {/if}
</section>

<section class="mt-10 border-t border-line pt-8">
  <h2 class="font-medium">{t.vocabulary.heading}</h2>
  <p class="mt-1 text-xs text-muted">{t.vocabulary.hint}</p>

  <!--
    One grid rather than a row of flexed spans, so every box starts and ends in the same place: an
    id is as long as its word, and a row that sizes itself around one leaves the column ragged.
  -->
  <ul class="mt-4 grid gap-2">
    {#each vocabulary.all as kind (kind.id)}
      <li class="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_7rem]">
        <Input
          value={kind.label}
          aria-label={t.vocabulary.label}
          onchange={(event) => renameKind(kind.id, event.currentTarget.value)}
        />
        <span class="hidden truncate font-mono text-xs text-muted sm:block">{kind.id}</span>
        <Danger
          field
          question={t.asks.removeKind(kind.label)}
          detail={t.asks.removeKindWhy}
          confirm={t.common.remove}
          disabled={action.busy}
          onconfirm={() => removeKind(kind.id)}
        >
          {t.common.remove}
        </Danger>
      </li>
    {/each}
  </ul>

  <!-- The same three columns as a row above it, in fixed widths: `auto` sizes each grid alone. -->
  <div class="mt-2 grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_7rem]">
    <Input bind:value={adding} placeholder={t.vocabulary.add} aria-label={t.vocabulary.add} />
    <span class="hidden sm:block"></span>
    <Button field disabled={action.busy || !adding.trim()} onclick={addKind}>{t.common.add}</Button>
  </div>
</section>

<section class="mt-10 border-t border-line pt-8">
  <h2 class="font-medium">{t.access.heading}</h2>
  <p class="mt-1 text-xs text-muted">{t.access.hint}</p>

  <div class="mt-4 grid gap-4">
    <Field label={t.access.organisations} hint={t.access.organisationsHint} group>
      <Tags
        bind:values={organisations}
        placeholder={t.access.exampleOrganisation}
        label={t.access.organisations}
        check={(value) => Club.ORGANISATION.test(value)}
      />
    </Field>

    <Field label={t.access.domains} hint={t.access.domainsHint} group>
      <Tags
        bind:values={domains}
        placeholder={t.access.example}
        label={t.access.domains}
        check={(value) => Club.DOMAIN.test(value)}
      />
    </Field>

    {#if organisations.length === 0 && domains.length === 0}
      <p class="text-xs text-muted">{t.access.everybody}</p>
    {/if}

    <Field label={t.access.allowed} hint={t.access.allowedHint} group>
      <Tags
        bind:values={allowed}
        placeholder={t.access.address}
        label={t.access.allowed}
        check={(value) => value.includes('@')}
      />
    </Field>

    <Field label={t.access.blocked} hint={t.access.blockedHint} group>
      <Tags
        bind:values={blocked}
        placeholder={t.access.address}
        label={t.access.blocked}
        check={(value) => value.includes('@')}
      />
    </Field>

    {#if configured.data?.providers.length}
      <Field label={t.access.providers} hint={t.access.providersHint} group>
        <!--
          The list of what a deployment configured comes from the server, so a club cannot pick a
          provider that is not there and lock itself out of its own site.
        -->
        <div class="flex flex-wrap gap-3">
          {#each configured.data.providers as provider (provider)}
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={providers.includes(provider)}
                onchange={(event) =>
                  (providers = event.currentTarget.checked
                    ? [...providers, provider]
                    : providers.filter((one) => one !== provider))}
              />
              {Marks.label(provider)}
            </label>
          {/each}
        </div>
      </Field>

      {#if providers.length === 0}
        <p class="text-xs text-muted">{t.access.anyProvider}</p>
      {/if}
    {/if}

    <Field label={t.access.admission} hint={t.access.admissionHint}>
      <Select bind:value={admission} options={Club.ADMISSIONS} name={(one) => t.admissions[one]} />
    </Field>

    <div class="grid gap-4 sm:grid-cols-2">
      <Field label={t.settings.language} hint={t.settings.languageHint}>
        <Select
          bind:value={locale}
          options={LOCALES}
          name={(one) => Words.NAMES[one]}
          empty={t.settings.languageAuto}
        />
      </Field>

      <Field label={t.settings.timezone} hint={t.settings.timezoneHint}>
        <Input bind:value={timezone} placeholder="Europe/Zurich" />
      </Field>
    </div>
  </div>
</section>

<section class="mt-10 border-t border-line pt-8">
  <h2 class="font-medium">{t.rules.heading}</h2>
  <p class="mt-1 text-xs text-muted">{t.rules.hint}</p>

  <div class="mt-4 grid gap-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <Field label={t.rules.deadline} hint={t.rules.deadlineHint}>
        <Scale bind:value={deadline} range={Club.HOURS} unit="h" />
      </Field>

      <Field label={t.rules.remind} hint={t.rules.remindHint}>
        <Scale bind:value={remind} range={Club.HOURS} unit="h" />
      </Field>
    </div>

    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" bind:checked={guests} />
      {t.rules.guests}
    </label>

    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" bind:checked={waitlist} />
      {t.rules.waitlist}
    </label>
  </div>
</section>

<div class="sticky bottom-0 mt-8 flex items-center gap-4 border-t border-line bg-paper py-4">
  <Button look="solid" disabled={action.busy || !name} onclick={save}>{t.common.save}</Button>
  {#if action.error}<span class="min-w-0 flex-1"><Alert error={action.error} /></span>{/if}
</div>

<section class="mt-10 border-t border-line pt-8">
  <h2 class="font-medium">{t.settings.trail}</h2>
  <p class="mt-1 text-xs text-muted">{t.settings.trailHint}</p>

  <div class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-center">
    <Select
      value={act}
      options={ACTS}
      name={(one) => t.acts[one]}
      empty={t.settings.everyAct}
      label={t.settings.filterAct}
      onchange={filter}
    />
    <span class="text-xs text-muted">{t.settings.entries(trail.data?.total ?? 0)}</span>
  </div>

  <Panel query={trail}>
    <ul class="mt-4 grid gap-1">
      {#each trail.data?.entries ?? [] as entry (entry.id)}
        <li class="grid gap-0.5 rounded-lg px-3 py-2 text-sm odd:bg-sunk">
          <div class="flex flex-wrap items-baseline justify-between gap-x-4">
            <span>
              <!-- Who did it comes first: an act with no actor is the half of the answer nobody needs. -->
              <span class="font-medium">{entry.actor ?? t.settings.byTheApp}</span>
              <span class="text-muted"> {t.acts[entry.act]}</span>
            </span>
            <span class="font-mono text-xs text-muted">{Format.full(entry.at)}</span>
          </div>

          {#if entry.subject || Object.keys(entry.detail ?? {}).length}
            <p class="font-mono text-xs break-words text-muted">
              {#if entry.subject}<span>{entry.subject}</span>{/if}
              {#each Object.entries(entry.detail ?? {}) as [key, value] (key)}
                <span class="ml-2">{key}: {stringify(value)}</span>
              {/each}
            </p>
          {/if}
        </li>
      {/each}
    </ul>

    {#if trail.data?.total === 0}
      <p class="mt-3 text-sm text-muted">{t.settings.trailEmpty}</p>
    {/if}

    <Pager bind:offset={done} window={Audit.WINDOW} total={trail.data?.total ?? 0} />
  </Panel>
</section>
