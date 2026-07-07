import { STATIONS } from './stations.js';

// 各駅にrank(0〜7)に応じて2〜4件の物件を生成する。価格・収益率はrankで決まる。
function propertyCountForRank(rank) {
  if (rank >= 6) return 4;
  if (rank >= 3) return 3;
  return 2;
}

const NAME_SUFFIXES = ['商店', '百貨店', '不動産', '牧場', '工場', '観光公社', 'ホテル', '青果市場'];

export function buildProperties(rng = Math.random) {
  // { [stationIndex]: [{ id, stationIndex, name, price, incomeRate, ownerId }] }
  const result = {};
  STATIONS.forEach((station, i) => {
    const count = propertyCountForRank(station.rank);
    const basePrice = 300 + station.rank * 220;
    const props = [];
    for (let k = 0; k < count; k++) {
      const price = Math.round((basePrice + k * 120) * (0.9 + rng() * 0.3));
      const incomeRate = 0.14 + rng() * 0.06; // 14〜20%
      props.push({
        id: `${i}-${k}`,
        stationIndex: i,
        name: `${station.name}${NAME_SUFFIXES[(i + k) % NAME_SUFFIXES.length]}`,
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
