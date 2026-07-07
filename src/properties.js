import { STATIONS } from './stations.js';

// 各駅にrank(0〜7)に応じて2〜4件の物件を生成する。価格・収益率はrankで決まる。
function propertyCountForRank(rank) {
  if (rank >= 6) return 4;
  if (rank >= 3) return 3;
  return 2;
}

// 各駅にちなんだ物件名(STATIONSと同じ順)。その駅らしさが伝わるよう、名所・名物から連想して名付けている。
const PROPERTY_NAMES = [
  ['丸の内一丁目商事', '赤レンガ観光案内所', '新幹線ホーム売店', '皇居ランニンググッズ店'], // 東京
  ['神保町ふるほん堂', '神田カレー横丁', '三省堂もどき書店'], // 神田
  ['秋葉原電気街商会', 'メイドカフェ「AKIBA亭」', 'フィギュア専門ホビーストア'], // 秋葉原
  ['御徒町宝石街', 'アメ横乾物屋'], // 御徒町
  ['上野動物園グッズ売店', 'アメ横海鮮市場', '上野公園ミュージアムショップ'], // 上野
  ['鶯谷ラブホテル組合', '谷根千せんべい店'], // 鶯谷
  ['日暮里繊維街生地問屋', '谷中霊園石材店'], // 日暮里
  ['西日暮里諏方神社お守り処', '日暮里富士見坂展望茶屋'], // 西日暮里
  ['田端文士村文具店', '田端崖の上パン工房'], // 田端
  ['六義園盆栽園', '駒込染井吉野桜苗木店'], // 駒込
  ['とげぬき地蔵前赤パンツ店', 'おばあちゃんの原宿商店街'], // 巣鴨
  ['大塚都電もなか店', '大塚北口レトロ居酒屋'], // 大塚
  ['サンシャイン展望水族館', '乙女ロードアニメグッズ店', '池袋西口ラーメン組合', '東京芸術劇場チケット売場'], // 池袋
  ['学習院前文具店', '目白庭園茶室'], // 目白
  ['早稲田応援グッズ店', '鉄腕アトム像前みやげ屋', '高田馬場ラーメン戦国街'], // 高田馬場
  ['コリアンタウンK-POPグッズ店', '新大久保チーズタッカルビ食堂', '職安通りコスメショップ'], // 新大久保
  ['歌舞伎町ネオン案内所', '新宿御苑温室植物園', '都庁展望台みやげ処', '思い出横丁焼き鳥屋'], // 新宿
  ['代々木公園ピクニック用品店', '代々木ビル電波塔展望台'], // 代々木
  ['竹下通りクレープ屋', '表参道ヒルズセレクトショップ', '原宿系プリクラ館'], // 原宿
  ['スクランブル交差点案内所', 'ハチ公前待ち合わせグッズ店', '渋谷ギャルファッション店', '道玄坂センター街カラオケ'], // 渋谷
  ['恵比寿ビール記念館', '恵比寿ガーデンプレイス洋菓子店', '恵比寿横丁立ち飲み屋'], // 恵比寿
  ['目黒川桜並木花見団子店', '目黒さんま祭り屋台', '目黒雅叙園美術品店'], // 目黒
  ['五反田雑居ビル商店', '五反田駅前ビジネスホテル組合', '目黒川河岸屋台'], // 五反田
  ['大崎ニューシティオフィス街', '大崎ゲートシティ弁当店'], // 大崎
  ['品川新幹線みやげ処', 'しながわ水族館グッズ店', '品川プリンス遊園地チケット', '御殿山庭園茶屋'], // 品川
  ['無人AIコンビニ実験店', '開業記念がらんどう記念館'], // 高輪ゲートウェイ
  ['慶應義塾前文具店', '田町運河沿いオフィス街', '三田図書コーナー'], // 田町
  ['東京タワー展望台みやげ処', 'モノレール羽田行き案内所', '浜松町世界貿易センタービル'], // 浜松町
  ['SL広場サラリーマン居酒屋', '新橋烏森神社お守り処', 'ニュー新橋ビル飲食街'], // 新橋
  ['有楽町マリオンチケット売場', '交通会館物産展', '銀座隣接ガード下焼き鳥屋'], // 有楽町
];

export function buildProperties(rng = Math.random) {
  // { [stationIndex]: [{ id, stationIndex, name, price, incomeRate, ownerId }] }
  const result = {};
  STATIONS.forEach((station, i) => {
    const count = propertyCountForRank(station.rank);
    const basePrice = 300 + station.rank * 220;
    const names = PROPERTY_NAMES[i];
    const props = [];
    for (let k = 0; k < count; k++) {
      const price = Math.round((basePrice + k * 120) * (0.9 + rng() * 0.3));
      const incomeRate = 0.14 + rng() * 0.06; // 14〜20%
      props.push({
        id: `${i}-${k}`,
        stationIndex: i,
        name: names[k % names.length],
        price,
        incomeRate,
        ownerId: null,
      });
    }
    result[i] = props;
  });
  return result;
}

// 独占込みの、この駅でownerIdが得る決算収益
export function stationIncome(properties, stationIndex, ownerId) {
  const all = properties[stationIndex];
  const owned = all.filter((p) => p.ownerId === ownerId);
  if (owned.length === 0) return 0;
  let total = owned.reduce((sum, p) => sum + p.price * p.incomeRate, 0);
  const allOwned = all.every((p) => p.ownerId === ownerId);
  if (allOwned) total *= 2; // 独占ボーナス
  return Math.round(total);
}

export function isMonopoly(properties, stationIndex, ownerId) {
  const all = properties[stationIndex];
  return all.length > 0 && all.every((p) => p.ownerId === ownerId);
}

// プレイヤーが所有する全物件の購入価格合計(総資産計算に使う)
export function totalPropertyValue(properties, ownerId) {
  let total = 0;
  Object.values(properties).forEach((props) => {
    props.forEach((p) => {
      if (p.ownerId === ownerId) total += p.price;
    });
  });
  return total;
}
