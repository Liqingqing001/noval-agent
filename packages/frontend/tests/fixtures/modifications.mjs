export const edits = [
  ['四个小时', '从三个人走出北门，到这份稿子发出去，四个小时十二分。', '从三个人在观察舱里睁眼，到这份稿子发出去，四个小时十二分。'],
  ['四个小时', '五点二十分，稿子才发出去，发给市里的主管部门。', '三点五十五分，稿子才发出去，发给市里的主管部门。'],
  ['四个小时', '正面写着"金杯 京A·7K3"', '正面写着"金杯 南A·7K3"'],
  ['四个小时', '八点五十分，礼堂外面的走廊里，第一声不像人的叫声传了进来。', '八点五十分，周聿掀开幕布往北边看了一眼。北区那个方向，天黑得比别处沉，像有一块布从天上扣下来。他当时没多想，把幕布放下了。'],
  ['四个小时', '万一真有什么事，你是唯一能一次喊到全校的人。', '万一真有什么事，你是唯一能一次喊住全场的人。'],
  ['数', '西区那个方向，灯灭到现在快四十分钟了。', '西区那个方向，灯灭到现在快二十分钟了。'],
];
export const inlineModification = ([title, original, replacement]) => `【修改】 目标：章节 标题：${title} 原内容：${original} 新内容：${replacement} 【/修改】`;
export const modificationReply = edits.map((edit, index) => `${inlineModification(edit)}\n（第 ${index + 1} 条的说明，不属于正文）`).join('\n');
export const chapterText = title => edits.filter(edit => edit[0] === title).map(edit => edit[1]).join('\n');
