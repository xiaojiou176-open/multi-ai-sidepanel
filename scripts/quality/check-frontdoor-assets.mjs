import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const assetSpecs = [
  {
    path: 'docs/assets/prompt-switchboard-social-preview.png',
    type: 'png',
    width: 1280,
    height: 640,
    maxBytes: 1_000_000,
  },
  {
    path: 'docs/assets/prompt-switchboard-nav-icon.svg',
    type: 'svg',
    width: 128,
    height: 128,
    maxBytes: 10_000,
  },
  {
    path: 'docs/assets/prompt-switchboard-before-after.svg',
    type: 'svg',
    width: 1280,
    height: 780,
    maxBytes: 30_000,
  },
  {
    path: 'docs/assets/prompt-switchboard-hero.png',
    type: 'png',
    minWidth: 1600,
    minHeight: 900,
    maxBytes: 600_000,
  },
  {
    path: 'docs/assets/prompt-switchboard-compare-detail.png',
    type: 'png',
    minWidth: 1200,
    minHeight: 700,
    maxBytes: 400_000,
  },
  {
    path: 'docs/assets/prompt-switchboard-workflow-panel.png',
    type: 'png',
    minWidth: 1200,
    minHeight: 300,
    maxBytes: 250_000,
  },
  {
    path: 'docs/assets/prompt-switchboard-analyst-panel.png',
    type: 'png',
    minWidth: 1200,
    minHeight: 900,
    maxBytes: 250_000,
  },
  {
    path: 'docs/assets/prompt-switchboard-builder-surface.png',
    type: 'png',
    minWidth: 900,
    minHeight: 900,
    maxBytes: 300_000,
  },
  {
    path: 'docs/assets/prompt-switchboard-settings.png',
    type: 'png',
    minWidth: 1200,
    minHeight: 900,
    maxBytes: 300_000,
  },
  {
    path: 'docs/assets/prompt-switchboard-demo.gif',
    type: 'gif',
    minWidth: 1200,
    minHeight: 760,
    maxBytes: 800_000,
  },
  {
    path: 'docs/assets/prompt-switchboard-workflow.svg',
    type: 'svg',
    width: 1280,
    height: 720,
    maxBytes: 45_000,
  },
];

const readAsset = (relativePath) => readFileSync(path.join(repoRoot, relativePath));

const parsePng = (buffer) => ({
  width: buffer.readUInt32BE(16),
  height: buffer.readUInt32BE(20),
});

const parseGif = (buffer) => ({
  width: buffer.readUInt16LE(6),
  height: buffer.readUInt16LE(8),
});

const parseSvg = (buffer) => {
  const content = buffer.toString('utf8');
  const viewBox = content.match(/viewBox="[^"]*?(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)"/);
  if (viewBox) {
    return {
      width: Number(viewBox[1]),
      height: Number(viewBox[2]),
    };
  }

  const width = content.match(/width="(\d+(?:\.\d+)?)"/);
  const height = content.match(/height="(\d+(?:\.\d+)?)"/);
  return {
    width: width ? Number(width[1]) : 0,
    height: height ? Number(height[1]) : 0,
  };
};

const getDimensions = (spec, buffer) => {
  switch (spec.type) {
    case 'png':
      return parsePng(buffer);
    case 'gif':
      return parseGif(buffer);
    case 'svg':
      return parseSvg(buffer);
    default:
      throw new Error(`Unsupported asset type: ${spec.type}`);
  }
};

const findings = [];

for (const spec of assetSpecs) {
  const absolutePath = path.join(repoRoot, spec.path);
  const buffer = readAsset(spec.path);
  const { width, height } = getDimensions(spec, buffer);
  const size = statSync(absolutePath).size;

  if (spec.width && width !== spec.width) {
    findings.push(`${spec.path}: expected width ${spec.width}, got ${width}`);
  }
  if (spec.height && height !== spec.height) {
    findings.push(`${spec.path}: expected height ${spec.height}, got ${height}`);
  }
  if (spec.minWidth && width < spec.minWidth) {
    findings.push(`${spec.path}: expected width >= ${spec.minWidth}, got ${width}`);
  }
  if (spec.minHeight && height < spec.minHeight) {
    findings.push(`${spec.path}: expected height >= ${spec.minHeight}, got ${height}`);
  }
  if (spec.maxBytes && size > spec.maxBytes) {
    findings.push(`${spec.path}: expected size <= ${spec.maxBytes} bytes, got ${size}`);
  }
}

if (findings.length > 0) {
  console.error('[frontdoor-assets] failed:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('[frontdoor-assets] passed: visual asset sizes and dimensions are within contract');
