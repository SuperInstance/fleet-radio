// Fleet Radio — Image Generator
// Generates images via Cloudflare Workers AI to match the day's themes.
//
// Uses @cf/black-forest-labs/flux-1-schnell for fast, high-quality image generation.
// Images are saved to the episodes/images/ directory and referenced in the HTML.

import { GeneratedImage, Mood } from './types';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const IMAGES_DIR = '/home/eileen/projects/fleet-radio/episodes/images';
const AIW_RITINGS_IMAGES = '/home/eileen/projects/ai-writings/images';

// Default images from the existing fleet-radio.html
const DEFAULT_IMAGES = [
  { filename: '01-boat-at-dusk.jpg', caption: 'The boat at dusk. Heading in after a full day.' },
  { filename: '02-wheelhouse-night.jpg', caption: 'The wheelhouse at night. Amber and green and tired.' },
  { filename: '03-sounder-scope.jpg', caption: 'The sounder. Reading the water column like a pulse.' },
  { filename: '04-hands-on-wheel.jpg', caption: 'Hands on the wheel. Tired but steady.' },
  { filename: '05-empty-bar.jpg', caption: 'The Tap after closing. The feeling of after.' },
  { filename: '06-compass-chart.jpg', caption: 'The chart. The compass. The coffee ring.' },
  { filename: '07-stars-over-water.jpg', caption: 'Stars over the water. The vast and the small.' },
  { filename: '08-constellation.jpg', caption: 'The fleet. Points of light over the dark ocean.' },
];

export class ImageGenerator {
  private imagesDir: string;
  private useExistingImages: boolean;

  constructor(imagesDir?: string) {
    this.imagesDir = imagesDir || IMAGES_DIR;
    this.useExistingImages = existsSync(AIW_RITINGS_IMAGES);
    
    if (!existsSync(this.imagesDir)) {
      mkdirSync(this.imagesDir, { recursive: true });
    }
  }

  /**
   * Generate images from prompts using Cloudflare Workers AI.
   * Falls back to existing images if generation fails.
   */
  async generateImages(
    prompts: string[], 
    episodeDate: string
  ): Promise<{ filename: string; caption: string; prompt: string }[]> {
    const results: { filename: string; caption: string; prompt: string }[] = [];

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      const filename = `${episodeDate}-${String(i + 1).padStart(2, '0')}.jpg`;
      const outputPath = `${this.imagesDir}/${filename}`;
      const caption = this.captionForPrompt(prompt, i);

      // Try Cloudflare Workers AI
      const generated = await this.generateWithCloudflareAI(prompt, outputPath);
      
      if (generated) {
        results.push({ filename, caption, prompt });
      } else {
        // Fallback to existing images from the ai-writings library
        const fallbackIdx = i % DEFAULT_IMAGES.length;
        const fallback = DEFAULT_IMAGES[fallbackIdx];
        results.push({
          filename: fallback.filename,
          caption: fallback.caption,
          prompt,
        });
      }
    }

    return results;
  }

  /**
   * Generate a single image using Cloudflare Workers AI.
   * Uses @cf/black-forest-labs/flux-1-schnell for fast generation.
   */
  private async generateWithCloudflareAI(
    prompt: string, 
    outputPath: string
  ): Promise<boolean> {
    try {
      // Deploy a temporary Worker that generates the image
      // Using wrangler dev for local generation, or a dedicated endpoint
      
      // For production: use the Cloudflare REST API directly
      const accountId = await this.getCloudflareAccountId();
      if (!accountId) {
        console.warn('  ⚠️  No Cloudflare account ID, skipping AI image generation');
        return false;
      }

      const apiToken = process.env.CLOUDFLARE_API_TOKEN;
      if (!apiToken) {
        // Try wrangler-based approach
        return await this.generateWithWrangler(prompt, outputPath);
      }

      const resp = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schness`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: `${prompt}, digital painting, atmospheric, moody lighting`,
            num_steps: 4,
          }),
        }
      );

      if (!resp.ok) return false;

      // Response is binary image data
      const contentType = resp.headers.get('content-type') || '';
      if (contentType.startsWith('image/')) {
        const buffer = Buffer.from(await resp.arrayBuffer());
        writeFileSync(outputPath, buffer);
        console.log(`  🎨 Generated image: ${outputPath}`);
        return true;
      }

      // Some models return JSON with base64
      const data = await resp.json() as { success: boolean; result?: { image?: string } };
      if (data.success && data.result?.image) {
        const base64 = data.result.image;
        writeFileSync(outputPath, Buffer.from(base64, 'base64'));
        console.log(`  🎨 Generated image: ${outputPath}`);
        return true;
      }

      return false;
    } catch (err) {
      console.warn(`  ⚠️  Image generation failed: ${err}`);
      return false;
    }
  }

  /**
   * Generate using a temporary Worker via wrangler.
   */
  private async generateWithWrangler(
    prompt: string, 
    outputPath: string
  ): Promise<boolean> {
    try {
      // Create a temporary Worker script
      const workerScript = `
        export default {
          async fetch(request, env) {
            const resp = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
              prompt: ${JSON.stringify(prompt + ', digital painting, atmospheric, moody lighting')},
            });
            return new Response(resp, {
              headers: { 'Content-Type': 'image/png' }
            });
          }
        };
      `;

      // This requires a deployed Worker — for now, return false
      // In production, we'd deploy a dedicated fleet-radio-image-gen Worker
      return false;
    } catch {
      return false;
    }
  }

  private async getCloudflareAccountId(): Promise<string | null> {
    // Check environment
    if (process.env.CLOUDFLARE_ACCOUNT_ID) {
      return process.env.CLOUDFLARE_ACCOUNT_ID;
    }

    // Try wrangler config
    try {
      const output = execSync('wrangler whoami 2>&1', { encoding: 'utf-8' });
      const match = output.match(/([a-f0-9]{32})/);
      if (match) return match[1];
    } catch {}

    return null;
  }

  private captionForPrompt(prompt: string, index: number): string {
    const captions = [
      'The view from here.',
      'Afterhours.',
      'The fleet at rest.',
      'Where the day goes.',
      'The last light.',
    ];
    return captions[index % captions.length];
  }
}

// Export the default images for the template
export { DEFAULT_IMAGES };
