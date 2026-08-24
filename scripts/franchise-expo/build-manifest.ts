import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildManifest, fetchExpoRows } from './lib';

const DEFAULT_SOURCE_ROOT = 'C:\\Users\\tkay\\Documents\\카카오톡 받은 파일\\프랜차이즈 박람회';
const DEFAULT_OUTPUT = path.join(process.cwd(), 'data', 'franchise-expo-84', 'manifest.json');

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const sourceRoot = path.resolve(arg('--source-root') || DEFAULT_SOURCE_ROOT);
  const output = path.resolve(arg('--output') || DEFAULT_OUTPUT);
  const rows = await fetchExpoRows();
  const manifest = await buildManifest(rows, sourceRoot);

  const expected = {
    websiteRows: 130,
    localLogoFiles: 77,
    matchedRows: 77,
    uniqueBrands: 76,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (manifest.totals[key as keyof typeof expected] !== value) {
      throw new Error(
        `${key} 검증 실패: 예상 ${value}, 실제 ${manifest.totals[key as keyof typeof expected]}`,
      );
    }
  }

  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`manifest: ${output}`);
  console.log(`웹 ${manifest.totals.websiteRows}개 / 로컬 ${manifest.totals.localLogoFiles}개`);
  console.log(`매칭 ${manifest.totals.matchedRows}개 / 고유 브랜드 ${manifest.totals.uniqueBrands}개`);
  console.log(`중복 병합 ${manifest.duplicates.length}건`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
