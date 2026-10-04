import { describe, expect, it } from 'vitest';
import { isRelativePath, isWebImage, relativeImagePath, resolveImagePath } from './image-paths';

describe('image paths', () => {
  it('tells web addresses and local files apart', () => {
    expect(isWebImage('https://example.com/a.png')).toBe(true);
    expect(isWebImage('//cdn.example.com/a.png')).toBe(true);
    expect(isWebImage('attachments/a.png')).toBe(false);
    for (const local of ['a.png', '../attachments/a.png', 'my photo.png', 'C++/a.png']) {
      expect(isRelativePath(local), local).toBe(true);
    }
    for (const other of [
      'https://x.org/a.png',
      'data:image/png;base64,AA',
      '/etc/a.png',
      '#top',
      'a.png?v=1',
      '',
    ]) {
      expect(isRelativePath(other), other).toBe(false);
    }
  });

  it('resolves links against the note’s folder, never outside the notes folder', () => {
    expect(resolveImagePath('', 'attachments/a.png')).toBe('attachments/a.png');
    expect(resolveImagePath('Work/Projects', '../../attachments/a.png')).toBe('attachments/a.png');
    expect(resolveImagePath('Work', './img/../diagram.png')).toBe('Work/diagram.png');
    expect(resolveImagePath('Work', 'görsel 1.png')).toBe('Work/görsel 1.png');
    expect(resolveImagePath('', '../outside.png')).toBeNull();
    expect(resolveImagePath('Work', 'https://example.com/a.png')).toBeNull();
  });

  it('writes links from a folder to a file', () => {
    expect(relativeImagePath('', 'attachments/a.png')).toBe('attachments/a.png');
    expect(relativeImagePath('Work', 'attachments/a.png')).toBe('../attachments/a.png');
    expect(relativeImagePath('Work/Projects', 'attachments/a.png')).toBe('../../attachments/a.png');
    expect(relativeImagePath('Work/Projects', 'Work/diagram.png')).toBe('../diagram.png');
    expect(relativeImagePath('Work', 'Work/Sub/a.png')).toBe('Sub/a.png');
  });
});
