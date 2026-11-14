import { bounds } from './geometry';
import { FONT_FAMILY, FONT_SIZE, LINE_HEIGHT, edgeGeometry, exportPalette, shapeGeometry, textLines } from './render';
import type { DiagramNode, Doc } from './types';

const PADDING = 32;
const EDGE_COLOR = '#4b5363';

const escapeXml = (text: string) =>
  text.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

const round = (n: number) => Math.round(n * 100) / 100;

function nodeMarkup(node: DiagramNode): string {
  const { fill, stroke } = exportPalette[node.color];
  const paint = `fill="${fill}" stroke="${stroke}" stroke-width="1.5"`;
  const g = shapeGeometry(node);
  const shape =
    g.kind === 'rect'
      ? `<rect x="${round(g.x)}" y="${round(g.y)}" width="${round(g.w)}" height="${round(g.h)}" rx="${g.r}" ${paint}/>`
      : g.kind === 'ellipse'
        ? `<ellipse cx="${round(g.cx)}" cy="${round(g.cy)}" rx="${round(g.rx)}" ry="${round(g.ry)}" ${paint}/>`
        : `<path d="${g.d}" ${paint}/>`;
  const lines = textLines(node);
  const cx = node.x + node.w / 2;
  const firstY = node.y + node.h / 2 - ((lines.length - 1) * LINE_HEIGHT) / 2;
  const text = lines
    .map((line, i) => `<tspan x="${round(cx)}" y="${round(firstY + i * LINE_HEIGHT)}">${escapeXml(line)}</tspan>`)
    .join('');
  return `<g>${shape}<text text-anchor="middle" dominant-baseline="central" fill="#1b1d22">${text}</text></g>`;
}

/** A standalone SVG of the whole diagram, cropped to its content. */
export function toSvg(doc: Doc): string {
  const box = bounds(doc.nodes) ?? { x: 0, y: 0, w: 200, h: 100 };
  const x = box.x - PADDING;
  const y = box.y - PADDING;
  const w = box.w + PADDING * 2;
  const h = box.h + PADDING * 2;

  const edges = doc.edges
    .map((edge) => {
      const geo = edgeGeometry(doc, edge.from, edge.to);
      if (!geo) return '';
      const line = `<line x1="${round(geo.start.x)}" y1="${round(geo.start.y)}" x2="${round(geo.end.x)}" y2="${round(geo.end.y)}" stroke="${EDGE_COLOR}" stroke-width="1.5" marker-end="url(#arrow)"/>`;
      const label = edge.label
        ? `<text x="${round(geo.mid.x)}" y="${round(geo.mid.y)}" text-anchor="middle" dominant-baseline="central" fill="#1b1d22" stroke="#ffffff" stroke-width="4" paint-order="stroke">${escapeXml(edge.label)}</text>`
        : '';
      return `<g>${line}${label}</g>`;
    })
    .join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(x)} ${round(y)} ${round(w)} ${round(h)}" width="${Math.ceil(w)}" height="${Math.ceil(h)}" font-family="${FONT_FAMILY.replace(/"/g, "'")}" font-size="${FONT_SIZE}">`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${EDGE_COLOR}"/></marker></defs>`,
    `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" fill="#ffffff"/>`,
    edges,
    doc.nodes.map(nodeMarkup).join(''),
    '</svg>',
  ].join('');
}

export function toJson(doc: Doc): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** Rasterises an SVG string at `scale`× for crisp PNGs on high-density screens. */
export function svgToPng(svg: string, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const width = Number(/width="(\d+)"/.exec(svg)?.[1] ?? 800);
    const height = Number(/height="(\d+)"/.exec(svg)?.[1] ?? 600);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('Canvas is not available.'));
      context.scale(scale, scale);
      context.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed.'))), 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The SVG could not be rendered.'));
    };
    image.src = url;
  });
}

export function download(content: Blob | string, filename: string, type = 'application/octet-stream'): void {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
