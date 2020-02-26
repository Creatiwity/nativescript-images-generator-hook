# Nativescript images generator hook

Nativescript hook that generates App_Resources images based on a single high resolution image.

## Installation

```bash
npm install nativescript-images-generator-hook --save-dev
```

## Usage

Put all your 3x PNG images in `App_Resources/images`.

For instance, if you put `navbar_logo@3x.png` in this folder, it will be available as `res://navbar_logo`.
If you put an image without scale suffix, it will use it as a `x1` image. You can provide any integer scale from 1 to 5.

## License

MIT License - Copyright (c) 2020 Creatiwity
