import { describe, expect, it, vi } from 'vitest';
import { MeshStandardMaterial, Texture } from 'three';
import { createHomeTextures } from './homeTextures';

describe('whole-home texture lifecycle', () => {
  it('applies a stone and removes it without rebuilding geometry', async () => {
    const material = new MeshStandardMaterial({color:0x888888,transparent:true,opacity:0.68});
    const texture = new Texture();
    const dispose = vi.spyOn(texture, 'dispose');
    const controller = createHomeTextures([{key:'room:floor',material}], vi.fn(), vi.fn(), async () => texture);
    await controller.update({'room:floor':{assetId:'hmg-stone-amarone'}});
    expect(material.map).toBe(texture);
    expect(material.opacity).toBe(1);
    expect(material.color.getHex()).toBe(0xffffff);
    await controller.update({});
    expect(material.map).toBeNull();
    expect(material.color.getHex()).toBe(0x888888);
    expect(dispose).toHaveBeenCalledOnce();
    controller.dispose();
  });
  it('discards a late image after a newer selection', async () => {
    const material = new MeshStandardMaterial();
    const texture = new Texture();
    const dispose = vi.spyOn(texture, 'dispose');
    let finish!: (texture:Texture) => void;
    const controller = createHomeTextures([{key:'room:floor',material}], vi.fn(), vi.fn(), () => new Promise(resolve => {finish=resolve;}));
    const first = controller.update({'room:floor':{assetId:'hmg-stone-amarone'}});
    await controller.update({});
    finish(texture);
    await first;
    expect(material.map).toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
    controller.dispose();
  });
  it('reports failed images while retaining neutral materials', async () => {
    const material = new MeshStandardMaterial();
    const status = vi.fn();
    const controller = createHomeTextures([{key:'room:floor',material}], vi.fn(), status, async () => {throw new Error('unavailable');});
    await controller.update({'room:floor':{assetId:'hmg-stone-amarone'}});
    expect(status).toHaveBeenLastCalledWith(0, 1);
    expect(material.map).toBeNull();
    controller.dispose();
  });
});
