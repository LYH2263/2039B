import QRCode from 'qrcode';

export const POSTER_THEMES = {
  indigo: {
    name: '经典靛蓝',
    bgGradient: ['#4f46e5', '#7c3aed'],
    cardBg: '#ffffff',
    titleColor: '#1f2937',
    textColor: '#4b5563',
    mutedColor: '#9ca3af',
    accentColor: '#4f46e5',
    qrBg: '#ffffff',
    qrColor: '#1f2937'
  },
  sunset: {
    name: '暖阳橙',
    bgGradient: ['#f97316', '#ef4444'],
    cardBg: '#ffffff',
    titleColor: '#1f2937',
    textColor: '#4b5563',
    mutedColor: '#9ca3af',
    accentColor: '#f97316',
    qrBg: '#ffffff',
    qrColor: '#1f2937'
  },
  forest: {
    name: '森林绿',
    bgGradient: ['#059669', '#10b981'],
    cardBg: '#ffffff',
    titleColor: '#1f2937',
    textColor: '#4b5563',
    mutedColor: '#9ca3af',
    accentColor: '#059669',
    qrBg: '#ffffff',
    qrColor: '#1f2937'
  },
  midnight: {
    name: '暗夜蓝',
    bgGradient: ['#1e3a8a', '#1e40af'],
    cardBg: '#1e293b',
    titleColor: '#f8fafc',
    textColor: '#cbd5e1',
    mutedColor: '#64748b',
    accentColor: '#60a5fa',
    qrBg: '#f8fafc',
    qrColor: '#1e293b'
  },
  rose: {
    name: '玫瑰粉',
    bgGradient: ['#e11d48', '#f43f5e'],
    cardBg: '#ffffff',
    titleColor: '#1f2937',
    textColor: '#4b5563',
    mutedColor: '#9ca3af',
    accentColor: '#e11d48',
    qrBg: '#ffffff',
    qrColor: '#1f2937'
  }
};

const POSTER_WIDTH = 750;
const POSTER_PADDING = 40;
const CARD_PADDING = 36;
const QR_SIZE = 180;
const TITLE_MAX_LINES = 3;
const CONTENT_MAX_LINES = 8;
const TITLE_LINE_HEIGHT = 36;
const CONTENT_LINE_HEIGHT = 26;

function wrapText(ctx, text, maxWidth) {
  const chars = [...text];
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const testLine = currentLine + char;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine !== '') {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function truncateText(ctx, text, maxWidth, maxLines) {
  const lines = wrapText(ctx, text, maxWidth);

  if (lines.length <= maxLines) {
    return lines;
  }

  const truncated = lines.slice(0, maxLines);
  let lastLine = truncated[maxLines - 1];

  while (ctx.measureText(lastLine + '...').width > maxWidth && lastLine.length > 0) {
    lastLine = lastLine.slice(0, -1);
  }

  truncated[maxLines - 1] = lastLine + '...';
  return truncated;
}

function drawRoundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawGradientBackground(ctx, width, height, colors) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawDecorativeCircles(ctx, width, height) {
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = '#ffffff';

  ctx.beginPath();
  ctx.arc(width - 60, 80, 120, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(60, height - 100, 80, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
}

function measureLayout(ctx, title, author, date, content) {
  const cardWidth = POSTER_WIDTH - POSTER_PADDING * 2;
  const contentWidth = cardWidth - CARD_PADDING * 2;

  ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
  const titleLines = truncateText(ctx, title, contentWidth, TITLE_MAX_LINES);
  const titleHeight = titleLines.length * TITLE_LINE_HEIGHT;

  const metaHeight = 22 * 2 + 10;

  const dividerHeight = 28;

  ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
  const contentLines = truncateText(ctx, content, contentWidth, CONTENT_MAX_LINES);
  const contentHeight = contentLines.length * CONTENT_LINE_HEIGHT;

  const qrSectionHeight = Math.max(QR_SIZE, 60);
  const sectionGap = 36;

  const cardContentHeight = titleHeight + metaHeight + dividerHeight + contentHeight + sectionGap + qrSectionHeight;
  const cardHeight = cardContentHeight + CARD_PADDING * 2;

  const headerHeight = 80;
  const footerHeight = 80;
  const posterHeight = POSTER_PADDING + headerHeight + cardHeight + POSTER_PADDING + footerHeight;

  return {
    titleLines,
    contentLines,
    cardWidth,
    contentWidth,
    cardHeight,
    posterHeight
  };
}

function drawPosterContent(ctx, layout, options) {
  const { title, author, date, qrUrl, forumName, themeConfig, qrCanvas } = options;
  const { titleLines, contentLines, cardWidth, contentWidth, cardHeight, posterHeight } = layout;

  const cardX = POSTER_PADDING;

  drawGradientBackground(ctx, POSTER_WIDTH, posterHeight, themeConfig.bgGradient);
  drawDecorativeCircles(ctx, POSTER_WIDTH, posterHeight);

  let y = POSTER_PADDING + 30;

  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(forumName, POSTER_PADDING, y);

  y += 18;
  ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fillText('分享好内容，发现新世界', POSTER_PADDING, y);

  y += 32;
  const cardY = y;

  ctx.fillStyle = themeConfig.cardBg;
  drawRoundRect(ctx, cardX, cardY, cardWidth, cardHeight, 20);
  ctx.fill();

  y = cardY + CARD_PADDING;

  ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = themeConfig.titleColor;
  titleLines.forEach((line, index) => {
    ctx.fillText(line, cardX + CARD_PADDING, y + TITLE_LINE_HEIGHT * index);
  });
  y += titleLines.length * TITLE_LINE_HEIGHT + 24;

  ctx.fillStyle = themeConfig.mutedColor;
  ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(`作者：${author}`, cardX + CARD_PADDING, y);
  y += 22;
  ctx.fillText(`发布于：${date}`, cardX + CARD_PADDING, y);

  y += 28;

  ctx.fillStyle = themeConfig.accentColor;
  ctx.fillRect(cardX + CARD_PADDING, y, 40, 3);
  y += 20;

  ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = themeConfig.textColor;
  contentLines.forEach((line, index) => {
    ctx.fillText(line, cardX + CARD_PADDING, y + CONTENT_LINE_HEIGHT * index);
  });
  y += contentLines.length * CONTENT_LINE_HEIGHT + 36;

  const qrX = cardX + cardWidth - QR_SIZE - CARD_PADDING;
  const qrY = y;

  ctx.fillStyle = '#ffffff';
  drawRoundRect(ctx, qrX - 10, qrY - 10, QR_SIZE + 20, QR_SIZE + 20, 12);
  ctx.fill();

  ctx.drawImage(qrCanvas, qrX, qrY, QR_SIZE, QR_SIZE);

  const tipX = cardX + CARD_PADDING;
  const tipY = y + QR_SIZE / 2 - 10;

  ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = themeConfig.titleColor;
  ctx.fillText('扫码查看原文', tipX, tipY);

  ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = themeConfig.mutedColor;
  ctx.fillText('长按识别二维码', tipX, tipY + 24);

  const footerY = posterHeight - 40;
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.textAlign = 'center';
  ctx.fillText(`— ${forumName} · 分享好内容 —`, POSTER_WIDTH / 2, footerY);
}

export async function generatePoster(options) {
  const {
    title,
    author,
    date,
    content,
    qrUrl,
    forumName = '极简论坛',
    theme = 'indigo'
  } = options;

  const themeConfig = POSTER_THEMES[theme] || POSTER_THEMES.indigo;
  const dpr = window.devicePixelRatio || 2;

  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  const layout = measureLayout(measureCtx, title, author, date, content);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = POSTER_WIDTH * dpr;
  canvas.height = layout.posterHeight * dpr;
  canvas.style.width = POSTER_WIDTH + 'px';
  canvas.style.height = layout.posterHeight + 'px';

  ctx.scale(dpr, dpr);

  const qrCanvas = await QRCode.toCanvas(qrUrl, {
    width: QR_SIZE,
    margin: 0,
    color: {
      dark: themeConfig.qrColor,
      light: themeConfig.qrBg
    }
  });

  drawPosterContent(ctx, layout, {
    title,
    author,
    date,
    qrUrl,
    forumName,
    themeConfig,
    qrCanvas
  });

  return canvas;
}

export function downloadPoster(canvas, filename = 'poster.png') {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
