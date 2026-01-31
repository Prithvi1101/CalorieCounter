import os
import shutil
from pathlib import Path

# --- CONFIGURATION ---
# Change this to point to your raw dataset folder
SOURCE_DIR = "" 
TARGET_DIR = ""

def organize_images():
    source_path = Path(SOURCE_DIR)
    target_path = Path(TARGET_DIR)

    if not source_path.exists():
        print(f"Error: Source folder '{SOURCE_DIR}' not found!")
        return

    # Create target directory if it doesn't exist
    if target_path.exists():
        print(f"Warning: Target folder '{TARGET_DIR}' already exists.")
    else:
        target_path.mkdir(parents=True)

    print("🚀 Starting cleanup...")
    total_moved = 0

    # 1. Loop through Food Categories (e.g., 'Apple', 'Banana')
    for food_category in source_path.iterdir():
        if food_category.is_dir():
            food_name = food_category.name
            print(f"Processing: {food_name}...")

            # Create the clean category folder
            clean_category_dir = target_path / food_name
            clean_category_dir.mkdir(exist_ok=True)

            # 2. Dive into the messy subfolders (e.g., '1-Samsung...')
            # rglob('*') searches recursively through all subfolders
            for file_path in food_category.rglob('*'):
                if file_path.is_file() and file_path.suffix.lower() in ['.jpg', '.jpeg', '.png', '.bmp']:
                    
                    # Create a unique name to avoid overwriting files with the same name
                    # e.g. Samsung_image1.jpg
                    parent_folder = file_path.parent.name
                    new_filename = f"{parent_folder}_{file_path.name}"
                    
                    # Copy to the clean folder
                    shutil.copy2(file_path, clean_category_dir / new_filename)
                    total_moved += 1

    print("-" * 30)
    print(f"Success! Moved {total_moved} images to '{TARGET_DIR}'")
    print(f"Now update your train.py to use: DATASET_DIR = '{TARGET_DIR}'")

if __name__ == "__main__":
    organize_images()
