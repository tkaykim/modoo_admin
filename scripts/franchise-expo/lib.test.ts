import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import {
  adaptLogoContrast,
  analyzeLogoContrast,
  buildContrastLogoVariants,
  buildLogoPlacement,
  combineArtworkPreviews,
  dedupeExpoRows,
  parseExpoRows,
  prepareArtwork,
  preprocessLogo,
  recolorProductImage,
  type ExpoRow,
} from './lib';

const fixture = `
  <table><tr>
    <td style="background-image:url(/upload/join/logo/test.png)"></td>
    <td>1</td>
    <td class="subject">[치킨전문점]<strong><a href="join_view.php?idx=901">테스트 회사</a></strong> (TEST)</td>
    <td class="left">테스트 브랜드</td>
    <!--<td class="left">치킨, 사이드</td>-->
    <td>A-01</td><td>84</td>
  </tr></table>
`;

test('박람회 HTML 행을 구조화한다', () => {
  const rows = parseExpoRows(fixture, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].brand, '테스트 브랜드');
  assert.equal(rows[0].item, '치킨, 사이드');
  assert.equal(rows[0].sourceId, '901');
  assert.equal(rows[0].round, 84);
});

test('같은 브랜드는 최신 source id 하나로 병합한다', () => {
  const base: ExpoRow = {
    page: 1,
    number: 1,
    sourceId: '10',
    category: '치킨전문점',
    company: '테스트',
    englishName: '',
    brand: '도야짬뽕',
    item: '중식',
    booth: 'A-01',
    round: 84,
    logoFilename: 'logo.png',
    logoUrl: 'https://example.com/logo.png',
    detailUrl: 'https://example.com/10',
  };
  const result = dedupeExpoRows([base, { ...base, sourceId: '11', brand: '도야 짬뽕' }]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].sourceId, '11');
  assert.deepEqual(result.duplicates[0].droppedSourceIds, ['10']);
});

test('앞면 기본 배치는 착용자 왼쪽 가슴에 충분한 크기로 계산한다', () => {
  const placement = buildLogoPlacement(
    {
      id: 'front',
      imageUrl: 'https://example.com/front.png',
      printArea: { x: 100, y: 80, width: 400, height: 500 },
    },
    400,
    200,
  );
  assert.ok(placement.x >= 0);
  assert.ok(placement.y >= 0);
  assert.ok(placement.x + placement.width <= 400);
  assert.ok(placement.y + placement.height <= 500);
  assert.ok(placement.x >= 400 * 0.48);
  assert.ok(Math.max(placement.width / 400, placement.height / 500) >= 0.16);
  assert.equal(placement.width / placement.height, 2);
});

test('등판 배치는 중앙에 크게 계산한다', () => {
  const placement = buildLogoPlacement(
    {
      id: 'back',
      imageUrl: 'https://example.com/back.png',
      printArea: { x: 100, y: 80, width: 600, height: 800 },
    },
    400,
    200,
    null,
    'large-back',
  );
  assert.ok(placement.x >= 0);
  assert.ok(placement.y >= 0);
  assert.ok(placement.x + placement.width <= 600);
  assert.ok(placement.y + placement.height <= 800);
  assert.ok(Math.max(placement.width / 600, placement.height / 800) >= 0.38);
  assert.ok(Math.abs(placement.x + placement.width / 2 - 300) <= 1);
});

test('단색 테두리 배경을 투명하게 만들고 로고 영역을 trim한다', async () => {
  const input = await sharp({
    create: {
      width: 80,
      height: 60,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{
      input: await sharp({
        create: {
          width: 30,
          height: 20,
          channels: 3,
          background: { r: 20, g: 40, b: 180 },
        },
      }).png().toBuffer(),
      left: 25,
      top: 20,
    }])
    .png()
    .toBuffer();
  const output = await preprocessLogo(input);
  const metadata = await sharp(output).metadata();
  const pixel = await sharp(output).ensureAlpha().raw().toBuffer();
  assert.ok((metadata.width || 0) <= 32);
  assert.ok((metadata.height || 0) <= 22);
  assert.equal(pixel[3], 255);
});

test('로고 내부에 갇힌 배경도 투명하게 제거한다', async () => {
  const input = Buffer.from('<svg width="80" height="80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" fill="white"/><circle cx="40" cy="40" r="28" fill="none" stroke="#1e40af" stroke-width="14"/></svg>');
  const output = await preprocessLogo(input);
  const center = await sharp(output).ensureAlpha().raw().toBuffer();
  const metadata = await sharp(output).metadata();
  const centerX = Math.floor((metadata.width || 1) / 2);
  const centerY = Math.floor((metadata.height || 1) / 2);
  const offset = ((centerY * (metadata.width || 1)) + centerX) * 4;
  assert.equal(center[offset + 3], 0);
});

test('투명 배경의 검정 로고는 배경 제거 대상이 아니다', async () => {
  const input = await sharp({
    create: {
      width: 40,
      height: 40,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{ input: await sharp({
    create: {
      width: 20,
      height: 20,
      channels: 4,
      background: { r: 10, g: 10, b: 10, alpha: 1 },
    },
  }).png().toBuffer(), left: 10, top: 10 }]).png().toBuffer();
  const output = await preprocessLogo(input);
  const raw = await sharp(output).ensureAlpha().raw().toBuffer();
  assert.ok([...raw].some((value, index) => index % 4 === 3 && value > 0));
});

test('제품 미리보기의 contain 여백은 검정색이 아닌 배경색으로 합성된다', async () => {
  const productImage = await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  }).png().toBuffer();
  const logo = await sharp({
    create: {
      width: 100,
      height: 50,
      channels: 4,
      background: { r: 30, g: 60, b: 180, alpha: 1 },
    },
  }).png().toBuffer();
  const artwork = await prepareArtwork({
    side: {
      id: 'front',
      imageUrl: 'https://example.com/front.png',
      printArea: { x: 80, y: 80, width: 240, height: 240 },
    },
    productImage,
    logo,
    logoUrl: 'https://example.com/logo.png',
  });
  const corner = await sharp(artwork.previewBuffer)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  assert.deepEqual([...corner], [243, 241, 237]);
});

test('밝은 단색 로고는 어두운 의류가 필요한 것으로 분류한다', async () => {
  const whiteLogo = await sharp({
    create: {
      width: 50,
      height: 30,
      channels: 4,
      background: { r: 248, g: 248, b: 248, alpha: 1 },
    },
  }).png().toBuffer();
  const blackLogo = await sharp({
    create: {
      width: 50,
      height: 30,
      channels: 4,
      background: { r: 20, g: 20, b: 20, alpha: 1 },
    },
  }).png().toBuffer();
  assert.equal((await analyzeLogoContrast(whiteLogo)).needsDarkGarment, true);
  assert.equal((await analyzeLogoContrast(blackLogo)).needsDarkGarment, false);
  const whiteVariants = await buildContrastLogoVariants(whiteLogo, await analyzeLogoContrast(whiteLogo));
  const blackVariants = await buildContrastLogoVariants(blackLogo, await analyzeLogoContrast(blackLogo));
  assert.equal(whiteVariants.lightGarmentMode, 'black');
  assert.equal(whiteVariants.darkGarmentMode, 'original');
  assert.equal(blackVariants.lightGarmentMode, 'original');
  assert.equal(blackVariants.darkGarmentMode, 'white');
});

test('검정 의류용 대비 보정은 검정 요소를 밝히고 브랜드 컬러 차이는 유지한다', async () => {
  const input = await sharp(Buffer.from([
    10, 10, 10, 255,
    220, 20, 30, 255,
  ]), { raw: { width: 2, height: 1, channels: 4 } }).png().toBuffer();
  const output = await sharp(await adaptLogoContrast(input, 'dark-garment')).raw().toBuffer();
  assert.deepEqual([...output.slice(0, 4)], [255, 255, 255, 255]);
  assert.ok(output[4] > output[5]);
  assert.ok(output[5] >= 155);
  assert.equal(output[7], 255);
});

test('앞면과 등판 시안을 한 카드 이미지로 합친다', async () => {
  const productImage = await sharp({
    create: {
      width: 400,
      height: 500,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  }).png().toBuffer();
  const logo = await sharp({
    create: {
      width: 120,
      height: 60,
      channels: 4,
      background: { r: 20, g: 20, b: 20, alpha: 1 },
    },
  }).png().toBuffer();
  const front = await prepareArtwork({
    side: { id: 'front', imageUrl: 'front.png', printArea: { x: 80, y: 80, width: 240, height: 320 } },
    productImage,
    logo,
    logoUrl: 'https://example.com/logo.png',
    placementKind: 'left-chest',
  });
  const back = await prepareArtwork({
    side: { id: 'back', imageUrl: 'back.png', printArea: { x: 80, y: 80, width: 240, height: 320 } },
    productImage,
    logo,
    logoUrl: 'https://example.com/logo.png',
    placementKind: 'large-back',
  });
  const combined = await combineArtworkPreviews(front, back);
  const metadata = await sharp(combined).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 1000);
});

test('제품 색상 multiply는 투명도를 보존한다', async () => {
  const input = await sharp({
    create: {
      width: 2,
      height: 1,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  })
    .composite([{
      input: Buffer.from([255, 255, 255, 255]),
      raw: { width: 1, height: 1, channels: 4 },
      left: 0,
      top: 0,
    }])
    .png()
    .toBuffer();
  const output = await sharp(await recolorProductImage(input, '#1C1C1C')).raw().toBuffer();
  assert.deepEqual([...output.slice(0, 4)], [28, 28, 28, 255]);
  assert.equal(output[7], 0);
});
