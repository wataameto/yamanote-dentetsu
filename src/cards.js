// カード定義(12種)。category: progress(進行系) / move(移動系) / attack(妨害系) / money(お金系) / defense(防御系)
export const CARD_DEFS = {
  kaisoku: { id: 'kaisoku', name: 'かいそく', desc: 'サイコロ1個ぶん多く進む(合計2個)', category: 'progress', diceCount: 2, weight: 30 },
  kyuko: { id: 'kyuko', name: 'きゅうこう', desc: 'サイコロ2個ぶん多く進む(合計3個)', category: 'progress', diceCount: 3, weight: 20 },
  tokkyu: { id: 'tokkyu', name: 'とっきゅう', desc: 'サイコロ3個ぶん多く進む(合計4個)', category: 'progress', diceCount: 4, weight: 12 },
  nozomi: { id: 'nozomi', name: 'のぞみ', desc: 'サイコロ5個ぶんで一気に進む', category: 'progress', diceCount: 5, weight: 6 },
  buttobi: { id: 'buttobi', name: 'ぶっとび', desc: 'ランダムな駅へワープする', category: 'move', effect: 'randomStation', weight: 14 },
  chuoWarp: { id: 'chuoWarp', name: 'ちゅうおうワープ', desc: '中央線の駅へワープする', category: 'move', effect: 'chuoStation', weight: 10 },
  katanagari: { id: 'katanagari', name: 'かたな狩り', desc: '相手のカードを1枚うばう', category: 'attack', effect: 'stealCard', weight: 12 },
  gosokukyu: { id: 'gosokukyu', name: 'ごうそくきゅう', desc: '相手のカードを1枚こわす', category: 'attack', effect: 'breakCard', weight: 12 },
  furidashi: { id: 'furidashi', name: 'ふりだし', desc: '相手を品川(スタート)へ戻す', category: 'attack', effect: 'sendToStart', weight: 8 },
  takarakuji: { id: 'takarakuji', name: 'たからくじ', desc: 'ランダムでお金がもらえる', category: 'money', effect: 'lottery', weight: 20 },
  ginko: { id: 'ginko', name: 'ぎんこう', desc: '所有物件の収益をいますぐうけとる', category: 'money', effect: 'earlyIncome', weight: 14 },
  shield: { id: 'shield', name: 'シールド', desc: '次にうける妨害を1回むこうにする', category: 'defense', effect: 'shield', weight: 10 },
};

export function drawRandomCard(rng = Math.random) {
  const defs = Object.values(CARD_DEFS);
  const total = defs.reduce((s, d) => s + d.weight, 0);
  let r = rng() * total;
  for (const d of defs) {
    if (r < d.weight) return d.id;
    r -= d.weight;
  }
  return defs[0].id;
}
