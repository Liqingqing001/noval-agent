import test from 'node:test';
import assert from 'node:assert/strict';
import { completeSlashCommand, isSlashCommandDisabled, moveSlashCommandSelection, slashHeadQuery, slashOptionId } from '../src/lib/slashComposer.ts';

test('only a slash at the command head opens completion, with arguments and prose left alone', () => {
  assert.equal(slashHeadQuery('/'), '/');
  assert.equal(slashHeadQuery('  /续写'), '/续写');
  assert.equal(slashHeadQuery('/continue 当前'), null);
  assert.equal(slashHeadQuery('/continue 当前', 4), '/continue');
  assert.equal(slashHeadQuery('在这里写 /continue'), null);
  assert.equal(slashHeadQuery(''), null);
  assert.equal(slashHeadQuery('/check', 0), null);
});

test('completion changes only the command head, retaining arguments and every normal-draft character', () => {
  assert.deepEqual(completeSlashCommand('/con', '/continue'), { value: '/continue ', caret: 10 });
  const existing = '  /续写 当前 2000字\n保留这一段参数。';
  assert.equal(completeSlashCommand(existing, '/continue').value, '  /continue 当前 2000字\n保留这一段参数。');
  const draft = '保留我的完整草稿。\n第二段也不能被替换。';
  assert.deepEqual(completeSlashCommand(draft, '/rewrite'), { value: `/rewrite ${draft}`, caret: draft.length + 9 });
  assert.equal(completeSlashCommand('draft', '/invalid command').value, 'draft');
  assert.equal(slashHeadQuery(completeSlashCommand('/sta', '/status').value), null);
});

test('keyboard navigation wraps, skips disabled busy commands and protects existing drafts from local selection', () => {
  const commands = [{ kind: 'local', busyAllowed: true }, { kind: 'ai', busyAllowed: false }, { kind: 'local', busyAllowed: true }];
  assert.equal(moveSlashCommandSelection(commands, -1, 1), 0);
  assert.equal(moveSlashCommandSelection(commands, 0, 1, true), 2);
  assert.equal(moveSlashCommandSelection(commands, 2, 1, true), 0);
  assert.equal(moveSlashCommandSelection(commands, 0, -1, true), 2);
  assert.equal(moveSlashCommandSelection(commands, -1, 1, false, true), 1);
  assert.equal(moveSlashCommandSelection(commands, -1, 1, true, true), -1);
  assert.equal(isSlashCommandDisabled(commands[0], false, true), true);
  assert.equal(slashOptionId('composer-commands', 'continue'), 'composer-commands-option-continue');
});
