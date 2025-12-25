#!/bin/bash
# Download kuromoji dictionary files for local hosting

set -e

DICT_DIR="dict"
BASE_URL="https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict"

# Create dict directory if it doesn't exist
mkdir -p "$DICT_DIR"

# List of required dictionary files
FILES=(
    "base.dat.gz"
    "check.dat.gz"
    "tid.dat.gz"
    "tid_pos.dat.gz"
    "tid_map.dat.gz"
    "cc.dat.gz"
    "unk.dat.gz"
    "unk_pos.dat.gz"
    "unk_map.dat.gz"
    "unk_char.dat.gz"
    "unk_compat.dat.gz"
    "unk_invoke.dat.gz"
)

echo "Downloading kuromoji dictionary files..."

for file in "${FILES[@]}"; do
    echo "  - $file"
    curl -fsSL "$BASE_URL/$file" -o "$DICT_DIR/$file"
done

echo "✓ All dictionary files downloaded successfully!"
echo "Total size:"
du -sh "$DICT_DIR"
