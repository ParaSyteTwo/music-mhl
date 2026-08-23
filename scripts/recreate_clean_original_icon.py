import os
from PIL import Image, ImageDraw

def process_icon():
    src_path = r'C:\Users\Paul\.gemini\antigravity\brain\04782021-97ce-4857-8e31-5f7219591f46\.user_uploaded\media_1787437898783.png'
    img = Image.open(src_path).convert('RGBA')
    width, height = img.size
    print(f"Loaded pristine source: {width}x{height}")
    
    # 1. Obtener color lima del fondo
    lime_sample = img.getpixel((width // 2, 45))
    print(f"Lime color sample: {lime_sample}")
    
    # Encontrar la máscara del símbolo (auriculares + nota musical)
    # Los auriculares y notas están entre y = int(height * 0.12) y y = int(height * 0.66)
    # y entre x = int(width * 0.18) y x = int(width * 0.82)
    symbol_mask = Image.new('L', (width, height), 0)
    img_data = img.load()
    mask_data = symbol_mask.load()
    
    min_x, min_y, max_x, max_y = width, height, 0, 0
    cutoff_y = int(height * 0.66) # Ignorar estrictamente el texto "MHL Music"
    
    for y in range(int(height * 0.16), int(height * 0.65)):
        for x in range(int(width * 0.22), int(width * 0.78)):
            r, g, b, a = img_data[x, y]
            # Si es el color verde oscuro de los auriculares/nota
            if a > 80 and r < 140 and g < 160 and b < 60:
                mask_data[x, y] = 255
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
                
    print(f"Clean symbol bbox: ({min_x}, {min_y}) to ({max_x}, {max_y}), size: {max_x - min_x}x{max_y - min_y}")
    
    # Recortar el símbolo con su color exacto original
    symbol_crop = Image.new('RGBA', (max_x - min_x + 1, max_y - min_y + 1), (0, 0, 0, 0))
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            if mask_data[x, y] == 255:
                symbol_crop.putpixel((x - min_x, y - min_y), img_data[x, y])
                
    # 2. Recrear el disco circular 1:1 con su borde negro exacto
    clean_base = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(clean_base)
    
    # Encontrar el radio del círculo del original
    # Borde exterior negro y relleno lima
    margin = int(width * 0.015)
    border_width = int(width * 0.038)
    
    # Dibujar borde negro exterior
    draw.ellipse(
        [margin, margin, width - margin, height - margin],
        fill=lime_sample,
        outline=(20, 20, 20, 255),
        width=border_width
    )
    
    # 3. Pegar el símbolo de auriculares + nota perfectamente centrado en el disco
    sym_w, sym_h = symbol_crop.size
    target_x = (width - sym_w) // 2
    # El centro geométrico está en (height - sym_h) // 2
    target_y = (height - sym_h) // 2
    
    clean_base.paste(symbol_crop, (target_x, target_y), symbol_crop)
    
    # 4. Guardar todas las versiones requeridas
    clean_base.save('public/icon.png', format='PNG')
    print("Saved public/icon.png (1024x1024)")
    
    icon_512 = clean_base.resize((512, 512), Image.Resampling.LANCZOS)
    icon_512.save('public/icon-512.png', format='PNG')
    print("Saved public/icon-512.png (512x512)")
    
    icon_192 = clean_base.resize((192, 192), Image.Resampling.LANCZOS)
    icon_192.save('public/icon-192.png', format='PNG')
    print("Saved public/icon-192.png (192x192)")
    
    # 5. Generar MHL.ico para Windows con todos los tamaños
    ico_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    clean_base.save('public/MHL.ico', format='ICO', sizes=ico_sizes)
    print("Saved public/MHL.ico with multi-resolutions")
    
    # Copiar también a mhl-desktop si aplica
    if os.path.exists('mhl-desktop'):
        clean_base.save('mhl-desktop/MHL.ico', format='ICO', sizes=ico_sizes)
        print("Updated mhl-desktop/MHL.ico")
        
    # Actualizar Android mipmaps (tanto iconos legacy como Adaptive Icons v26)
    res_dir = 'android/app/src/main/res'
    if os.path.exists(res_dir):
        mipmap_configs = {
            'mipmap-xxxhdpi': {'legacy': 192, 'adaptive': 432, 'safe': 288},
            'mipmap-xxhdpi': {'legacy': 144, 'adaptive': 324, 'safe': 216},
            'mipmap-xhdpi': {'legacy': 96, 'adaptive': 216, 'safe': 144},
            'mipmap-hdpi': {'legacy': 72, 'adaptive': 162, 'safe': 108},
            'mipmap-mdpi': {'legacy': 48, 'adaptive': 108, 'safe': 72},
        }
        for folder, conf in mipmap_configs.items():
            folder_path = os.path.join(res_dir, folder)
            if os.path.exists(folder_path):
                # 1. Legacy square & round
                legacy_size = conf['legacy']
                resized_legacy = clean_base.resize((legacy_size, legacy_size), Image.Resampling.LANCZOS)
                resized_legacy.save(os.path.join(folder_path, 'ic_launcher.png'))
                resized_legacy.save(os.path.join(folder_path, 'ic_launcher_round.png'))
                
                # 2. Adaptive Foreground (Icono centrado en la zona segura del canvas 108dp)
                adaptive_size = conf['adaptive']
                safe_size = conf['safe']
                foreground = Image.new('RGBA', (adaptive_size, adaptive_size), (0, 0, 0, 0))
                disc_safe = clean_base.resize((safe_size, safe_size), Image.Resampling.LANCZOS)
                offset = (adaptive_size - safe_size) // 2
                foreground.paste(disc_safe, (offset, offset), disc_safe)
                foreground.save(os.path.join(folder_path, 'ic_launcher_foreground.png'))
                
                # 3. Adaptive Background (Fondo Luxury Dark #080808)
                background = Image.new('RGBA', (adaptive_size, adaptive_size), (8, 8, 8, 255))
                background.save(os.path.join(folder_path, 'ic_launcher_background.png'))
                
                print(f"Updated Android {folder} (legacy: {legacy_size}px, adaptive: {adaptive_size}px)")

if __name__ == '__main__':
    process_icon()
