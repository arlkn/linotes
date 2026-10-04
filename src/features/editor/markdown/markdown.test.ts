import { describe, expect, it } from 'vitest';
import { analyzeMarkdown, sameRendering } from './analyze';
import { parseMarkdown } from './parse';
import { editorSchema } from './schema';
import { documentsEquivalent, escapeInline, serializeMarkdown, serializeUnchecked } from './serialize';
import { normalizeImageSrc } from './tokenizer';

const schema = editorSchema();

function roundTrip(markdown: string): string {
  const parsed = parseMarkdown(markdown, schema);
  if (!parsed.ok) throw new Error(`parse failed: ${parsed.reasons.join(', ')}`);
  return serializeMarkdown(parsed.doc);
}

/** Build a one-paragraph document containing literal text. */
function paragraphDoc(text: string) {
  return schema.node('doc', null, [schema.node('paragraph', null, text ? [schema.text(text)] : [])]);
}

describe('round trip keeps Markdown written in Linotes style unchanged', () => {
  const cases: Record<string, string> = {
    paragraphs: 'First paragraph.\n\nSecond paragraph.\n',
    headings: '# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n',
    inline: 'Text with **bold**, *italic*, <u>underline</u>, ~~strike~~ and `code`.\n',
    nestedMarks: '***bold italic*** and **bold <u>under</u>**\n',
    tightList: '- one\n- two\n- three\n',
    looseList: '- one\n\n- two\n',
    nestedList: '- parent\n  - child\n    - grandchild\n- sibling\n',
    orderedList: '1. first\n2. second\n',
    orderedStart: '7.  seven\n8.  eight\n9.  nine\n10. ten\n',
    tasks: '- [ ] todo\n- [x] done\n',
    nestedTasks: '- [ ] parent\n  - [x] child\n',
    taskWithFormatting: '- [ ] buy **milk**\n',
    blockquote: '> quoted\n>\n> - list in quote\n',
    codeBlock: '```rust\nfn main() {\n    println!("hi");\n}\n```\n',
    codeBlockPlain: '```\nplain\n```\n',
    codeWithFence: '````\n```\ninner fence\n```\n````\n',
    inlineCodeWithBackticks: 'Use `` a`b `` here.\n',
    hardBreak: 'line one\\\nline two\n',
    softBreaks: 'a hard-wrapped\nparagraph keeps\nits line breaks\n',
    softBreakInList: '- item that\n  wraps\n',
    softBreakInQuote: '> quote that\n> wraps\n',
    link: '[Linotes](https://example.com/path?q=1)\n',
    linkWithTitle: '[site](https://example.com "The title")\n',
    autolink: '<https://example.com>\n',
    mailto: '[mail me](mailto:someone@example.com)\n',
    rule: 'above\n\n---\n\nbelow\n',
    unicode: 'Çalışma günü — ışık, öğle, üzüm 🌿 日本語\n',
    safeCharacters: 'snake_case, ~/Documents, 2 * 3 * 4, C:\\Users\\me, a < b, AT&T, 100%\n',
    headingWithHash: '# C# and F#\n',
    adjacentLists: '- a\n- b\n\n\n* c\n* d\n',
    image: '![A diagram](attachments/diagram.png)\n',
    imageNoAlt: '![](../attachments/image-20261004-183012.png)\n',
    imageWithTitle: '![Map](attachments/map.png "Our route")\n',
    imageInText: 'Before ![icon](icon.png) after, and **bold ![b](b.png)**.\n',
    imageInLink: '[![Logo](logo.png)](https://example.com)\n',
    imageUnicodePath: '![Görsel](attachments/görsel-1.png)\n',
    imageEncodedSpaces: '![x](my%20photo.png)\n',
    imageWeb: '![Web](https://example.com/a.png)\n',
    imagesInList: '- ![one](1.png)\n- ![two](2.png)\n',
  };

  for (const [name, markdown] of Object.entries(cases)) {
    it(name, () => {
      expect(roundTrip(markdown)).toBe(markdown);
    });
  }
});

describe('round trip normalises other Markdown without changing its meaning', () => {
  const cases: Array<[string, string, string]> = [
    ['star bullets', '* a\n* b\n', '- a\n- b\n'],
    ['underscore emphasis', '_it_ and __bold__\n', '*it* and **bold**\n'],
    ['setext heading', 'Title\n=====\n', '# Title\n'],
    ['indented code', '    code\n', '```\ncode\n```\n'],
    ['two-space hard break', 'a  \nb\n', 'a\\\nb\n'],
    ['tilde fence', '~~~js\nx\n~~~\n', '```js\nx\n```\n'],
    ['reference link', '[a][r]\n\n[r]: https://example.com\n', '[a](https://example.com)\n'],
    ['entity', 'caf&eacute;\n', 'café\n'],
    ['thematic stars', '***\n', '---\n'],
  ];
  for (const [name, input, output] of cases) {
    it(name, () => {
      expect(roundTrip(input)).toBe(output);
      expect(sameRendering(input, output)).toBe(true);
    });
  }
});

describe('literal text that looks like Markdown is escaped', () => {
  const cases: Array<[string, string]> = [
    ['*not emphasis*', '\\*not emphasis\\*'],
    ['__init__.py', '\\_\\_init\\_\\_.py'],
    ['~~not struck~~', '\\~\\~not struck\\~\\~'],
    ['# not a heading', '\\# not a heading'],
    ['- not a list', '\\- not a list'],
    ['+ not a list', '\\+ not a list'],
    ['1. not a list', '1\\. not a list'],
    ['> not a quote', '\\> not a quote'],
    ['[not](a link)', '\\[not](a link)'],
    ['`not code`', '\\`not code\\`'],
    ['<div>not html</div>', '\\<div>not html\\</div>'],
    ['&amp; stays literal', '\\&amp; stays literal'],
    ['---', '\\---'],
    ['[ ] not a task', '\\[ ] not a task'],
    ['ends with backslash\\', 'ends with backslash\\\\'],
  ];
  for (const [text, expected] of cases) {
    it(JSON.stringify(text), () => {
      const doc = paragraphDoc(text);
      const markdown = serializeMarkdown(doc);
      expect(markdown).toBe(`${expected}\n`);
      const parsed = parseMarkdown(markdown, schema);
      expect(parsed.ok && documentsEquivalent(doc, parsed.doc)).toBe(true);
    });
  }

  it('keeps ordinary punctuation readable', () => {
    expect(escapeInline('snake_case a * b ~/x a < b 5 > 3 array[0] = 1')).toBe(
      'snake_case a * b ~/x a < b 5 > 3 array[0] = 1',
    );
    expect(escapeInline('a<b')).toBe('a\\<b');
    expect(escapeInline('see [docs](x)')).toBe('see \\[docs](x)');
  });
});

describe('verified serialisation never loses text', () => {
  // Deterministic pseudo-random strings full of Markdown syntax characters.
  function* randomTexts(count: number): Generator<string> {
    let seed = 42;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const alphabet = [
      'a',
      'b',
      ' ',
      ' ',
      '*',
      '_',
      '~',
      '`',
      '[',
      ']',
      '(',
      ')',
      '#',
      '-',
      '+',
      '>',
      '<',
      '!',
      '\\',
      '&',
      ';',
      '|',
      '1',
      '.',
      ':',
      '=',
      'ı',
      'ş',
    ];
    for (let n = 0; n < count; n++) {
      const length = 1 + Math.floor(next() * 24);
      let text = '';
      for (let i = 0; i < length; i++) text += alphabet[Math.floor(next() * alphabet.length)];
      yield text.trim() || 'x';
    }
  }

  it('keeps image paths intact whatever the alt text and file name', () => {
    const names = ['a.png', 'my photo.png', 'görsel (1).png', '100%.png', 'a%41.png', '[x].png', 'a_b*c.png'];
    [...randomTexts(300)].forEach((alt, i) => {
      const src = normalizeImageSrc(`../attachments/${names[i % names.length]!}`);
      const image = schema.node('image', { src, alt });
      const markdown = serializeMarkdown(schema.node('doc', null, [schema.node('paragraph', null, [image])]));
      const parsed = parseMarkdown(markdown, schema);
      expect(parsed.ok, markdown).toBe(true);
      if (!parsed.ok) return;
      let found: string | undefined;
      parsed.doc.descendants((node) => {
        if (node.type.name === 'image') found = node.attrs.src as string;
      });
      expect(found, markdown).toBe(src);
    });
  });

  it('round-trips 600 adversarial strings exactly', () => {
    for (const text of randomTexts(600)) {
      const doc = paragraphDoc(text);
      const markdown = serializeMarkdown(doc);
      const parsed = parseMarkdown(markdown, schema);
      expect(parsed.ok, `unparseable output for ${JSON.stringify(text)}: ${markdown}`).toBe(true);
      if (parsed.ok) {
        expect(
          documentsEquivalent(doc, parsed.doc),
          `${JSON.stringify(text)} → ${JSON.stringify(markdown)}`,
        ).toBe(true);
      }
    }
  });

  it('round-trips marked text with punctuation', () => {
    const bold = schema.marks.bold!.create();
    const link = schema.marks.link!.create({ href: 'https://example.com/a_(b)' });
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('**', [bold]),
        schema.text(' mid ['),
        schema.text('link [x]', [link]),
        schema.text('] end'),
      ]),
    ]);
    const parsed = parseMarkdown(serializeMarkdown(doc), schema);
    expect(parsed.ok && documentsEquivalent(doc, parsed.doc)).toBe(true);
  });

  it('drops only what Markdown cannot store (empty paragraphs)', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('a')]),
      schema.node('paragraph'),
      schema.node('paragraph', null, [schema.text('b')]),
    ]);
    expect(serializeUnchecked(doc)).toBe('a\n\nb');
  });
});

describe('analysis decides when rich mode is safe', () => {
  it('accepts typical notes', () => {
    const note =
      '# Plan\n\nSome *text* with a [link](https://example.com).\n\n- [ ] task\n- [x] done\n\n```js\nconsole.log(1)\n```\n';
    expect(analyzeMarkdown(note).ok).toBe(true);
    expect(analyzeMarkdown('').ok).toBe(true);
  });

  it.each([
    ['tables', '| a | b |\n|---|---|\n| 1 | 2 |\n'],
    ['HTML', '<div align="center">hi</div>\n'],
    ['HTML', 'inline <span>html</span>\n'],
    ['lists mixing checkboxes and bullets', '- [ ] task\n- plain\n'],
  ])('rejects %s', (reason, markdown) => {
    const result = analyzeMarkdown(markdown);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain(reason);
  });

  it('accepts notes with images', () => {
    expect(analyzeMarkdown('# Trip\n\n![The map](attachments/map.png)\n').ok).toBe(true);
    expect(analyzeMarkdown('![with *formatted* alt](a.png)\n').ok).toBe(true);
  });

  it('keeps image links that use other spellings rendering the same', () => {
    for (const markdown of ['![x](<my photo.png>)\n', '![x](a\\(1\\).png)\n', '![a [b] c](x.png)\n']) {
      const result = analyzeMarkdown(markdown);
      expect(result.ok, markdown).toBe(true);
      if (result.ok) expect(sameRendering(markdown, serializeMarkdown(result.doc))).toBe(true);
    }
  });

  it('rejects unbalanced underline tags', () => {
    expect(analyzeMarkdown('<u>never closed\n').ok).toBe(false);
  });
});
