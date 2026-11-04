import test from 'node:test';
import assert from 'node:assert/strict';
import { chatDraftKey, clearSentChatDraft, readChatDraft, readLegacyChatDraft, restoreLegacyChatDraft, writeChatDraft, LEGACY_CHAT_DRAFT_KEY } from '../src/lib/chatDraft.ts';

const memory = () => {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};

test('draft keys isolate books and accounts without ambiguous separator collisions', () => {
  const storage = memory();
  const first = chatDraftKey('account-a', 'book-a'), otherBook = chatDraftKey('account-a', 'book-b'), otherAccount = chatDraftKey('account-b', 'book-a');
  assert.equal(writeChatDraft(first, '续写草稿', storage), '');
  assert.equal(readChatDraft(first, storage).value, '续写草稿');
  assert.equal(readChatDraft(otherBook, storage).value, '');
  assert.equal(readChatDraft(otherAccount, storage).value, '');
  assert.notEqual(chatDraftKey('a:b', 'c'), chatDraftKey('a', 'b:c'));
  assert.equal(chatDraftKey('account-a', null), null);
});

test('failed saves and clears do not destroy the durable previous draft', () => {
  const storage = memory(), key = chatDraftKey('a', 'book');
  writeChatDraft(key, '原草稿', storage);
  const blocked = { getItem: storage.getItem, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('denied'); } };
  assert.match(writeChatDraft(key, '新草稿', blocked), /仍保留/);
  assert.match(clearSentChatDraft(key, blocked), /仍保留/);
  assert.equal(storage.getItem(key), '原草稿');
  assert.equal(readChatDraft(key, storage).value, '新草稿');
  assert.match(readChatDraft(key, storage).error, /暂未保存/);
  assert.match(readChatDraft(chatDraftKey('other', 'book'), { ...storage, getItem: () => { throw new Error('denied'); } }).error, /原有草稿未覆盖/);
  assert.equal(writeChatDraft(key, '新草稿', storage), '');
  assert.equal(readChatDraft(key, storage).error, '');
});

test('an intentionally emptied draft keeps an empty tombstone when browser removal fails', () => {
  const storage = memory(), key = chatDraftKey('empty-account', 'book');
  const blocked = { ...storage, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('denied'); } };
  writeChatDraft(key, '尚未保存', blocked);
  writeChatDraft(key, '', blocked);
  assert.equal(readChatDraft(key, storage).value, '');
  assert.match(readChatDraft(key, storage).error, /暂未保存/);
  assert.equal(writeChatDraft(key, '', storage), '');
  assert.equal(readChatDraft(key, storage).error, '');
});

test('a failed draft remains available after editing another book and retries only its scoped text', () => {
  const storage = memory(), first = chatDraftKey('failed-account', 'first'), second = chatDraftKey('failed-account', 'second');
  const blocked = { ...storage, setItem: () => { throw new Error('quota'); } };
  writeChatDraft(first, '第一本尚未保存的文字', blocked);
  writeChatDraft(second, '第二本正常保存', storage);
  assert.equal(readChatDraft(first, storage).value, '第一本尚未保存的文字');
  assert.equal(readChatDraft(second, storage).value, '第二本正常保存');
  assert.equal(readChatDraft(chatDraftKey('another-account', 'first'), storage).value, '');
  writeChatDraft(first, readChatDraft(first, storage).value, storage);
  assert.equal(readChatDraft(first, storage).error, '');
});

test('legacy global drafts move only explicitly and only after the new scoped save succeeds', () => {
  const storage = memory(), key = chatDraftKey('account-a', 'book-a');
  storage.setItem(LEGACY_CHAT_DRAFT_KEY, '旧版文字');
  assert.equal(readChatDraft(key, storage).value, '');
  assert.equal(readLegacyChatDraft(storage), '旧版文字');
  const blocked = { ...storage, setItem: () => { throw new Error('quota'); } };
  assert.match(restoreLegacyChatDraft(key, blocked).error, /暂未保存/);
  assert.equal(readLegacyChatDraft(storage), '旧版文字');
  assert.deepEqual(restoreLegacyChatDraft(key, storage), { value: '旧版文字', error: '' });
  assert.equal(readLegacyChatDraft(storage), '');
  assert.equal(readChatDraft(key, storage).value, '旧版文字');
});

test('legacy recovery never overwrites a draft saved by another tab after the recovery hint appeared', () => {
  const storage = memory(), key = chatDraftKey('existing-account', 'book');
  storage.setItem(LEGACY_CHAT_DRAFT_KEY, '旧版文字');
  storage.setItem(key, '另一个标签页保存的新草稿');
  const result = restoreLegacyChatDraft(key, storage);
  assert.equal(result.value, '另一个标签页保存的新草稿');
  assert.match(result.error, /已有草稿/);
  assert.equal(storage.getItem(key), '另一个标签页保存的新草稿');
  assert.equal(readLegacyChatDraft(storage), '旧版文字');
});
