import ColorThief from 'color-thief-browser';

const colorThief = new ColorThief();

export function extractDominantColor(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const [r, g, b] = colorThief.getColor(img);
        resolve(`${r}, ${g}, ${b}`);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}
