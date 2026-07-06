// 山手線30駅(高輪ゲートウェイ含む)、東京から時計回り。
// rank(0〜7)は実際の利用者数の感覚に基づく概略(新宿・池袋が最高、鶯谷・高輪ゲートウェイが最低)。
// 各rankに駅が偏りすぎないよう、最大でも1ランクにつき5駅までに抑えている。
export const STATIONS = [
  { name: '東京', rank: 6 },
  { name: '神田', rank: 4 },
  { name: '秋葉原', rank: 5 },
  { name: '御徒町', rank: 2 },
  { name: '上野', rank: 5 },
  { name: '鶯谷', rank: 0 },
  { name: '日暮里', rank: 2 },
  { name: '西日暮里', rank: 1 },
  { name: '田端', rank: 0 },
  { name: '駒込', rank: 1 },
  { name: '巣鴨', rank: 2 },
  { name: '大塚', rank: 2 },
  { name: '池袋', rank: 7 },
  { name: '目白', rank: 1 },
  { name: '高田馬場', rank: 4 },
  { name: '新大久保', rank: 3 },
  { name: '新宿', rank: 7 },
  { name: '代々木', rank: 2 },
  { name: '原宿', rank: 3 },
  { name: '渋谷', rank: 6 },
  { name: '恵比寿', rank: 4 },
  { name: '目黒', rank: 3 },
  { name: '五反田', rank: 4 },
  { name: '大崎', rank: 2 },
  { name: '品川', rank: 6 },
  { name: '高輪ゲートウェイ', rank: 0 },
  { name: '田町', rank: 3 },
  { name: '浜松町', rank: 3 },
  { name: '新橋', rank: 5 },
  { name: '有楽町', rank: 4 },
];

// 山手線の内側を横断する中央線(快速)の駅。新宿⇄神田の間に挟まる2駅で、
// 新宿・神田・東京は山手線の輪の側に既にあるため含めない。
export const CHUO_STATIONS = [
  { name: '四ツ谷', rank: 2 },
  { name: '御茶ノ水', rank: 3 },
];

const MAX_MULTIPLIER = 50; // rank7(最高)で約50倍になる
const CURVE_POW = 2; // 大きいほど低ランクが緩く、高ランク付近だけ急に強くなる

export function getStageDifficultyForRank(rank) {
  const t = rank / 7;
  const tCurved = Math.pow(t, CURVE_POW); // 雑魚は弱いまま、ラスボス付近だけ急上昇するカーブ
  return {
    rank,
    enemyStatMultiplier: Math.pow(MAX_MULTIPLIER, tCurved),
    spawnIntervalMultiplier: 1 - tCurved * 0.55,
    spawnFloorMultiplier: 1 - tCurved * 0.45,
  };
}

export function getStageDifficulty(stationIndex) {
  return getStageDifficultyForRank(STATIONS[stationIndex].rank);
}
