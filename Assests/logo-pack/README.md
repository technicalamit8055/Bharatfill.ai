# BharatDoc — Official Mobile App Icon Pack

A production-ready mobile icon & store asset suite generated specifically for the **BharatDoc** mobile application (*"Aapka Personal Document Scanner & Sarkari Form Vault"*).

All assets are tailored strictly for mobile platforms (**Expo / React Native**, **iOS App Store**, **Google Play Store**, and **Native iOS/Android** catalogs) with sub-pixel anti-aliasing, color-calibrated gradients, and safe-area compliant framing.

> [!NOTE]
> This icon pack is exclusively for the **BharatDoc** mobile app. (The desktop website and browser extension are part of Bharatfill).

---

## 🎨 Mobile Brand Palette

| Name | Hex Code | RGB | Purpose |
| :--- | :--- | :--- | :--- |
| **Bharat Blue (Cyan Highlight)** | `#0CAEFC` | `rgb(12, 174, 252)` | App icon gradient highlight (top-left) |
| **Bharat Blue (Core Brand)** | `#047EFD` | `rgb(4, 126, 253)` | Primary brand color & mobile theme |
| **Royal Navy** | `#0043E8` | `rgb(0, 67, 232)` | Deep gradient midpoint |
| **Midnight Abyss** | `#000E78` | `rgb(0, 14, 120)` | Deep gradient shadow (bottom-right) |
| **Kesari / Saffron** | `#FF9933` | `rgb(255, 153, 51)` | Document top stripe & mascot sparkle ray |
| **White / Shwet** | `#FFFFFF` | `rgb(255, 255, 255)` | Mascot robot body & paper sheet |
| **India Green / Harit** | `#138808` | `rgb(19, 136, 8)` | Document bottom stripe & mascot sparkle ray |

---

## 📁 Directory Structure & Contents

```text
logo-pack/
├── preview.html                                    # Interactive visual showcase gallery (open in any browser)
├── README.md                                       # This documentation guide
│
├── master/                                         # 1024x1024 Master High-Res Assets
│   ├── master-app-icon.png                         # Squircle with transparent background (anti-aliased alpha)
│   ├── master-fullbleed-square.png                 # Full 90° square with continuous edge gradient (iOS App Store)
│   ├── master-circle.png                           # Seamless circular badge (Google Play round launcher)
│   ├── master-floating-shadow.png                  # 3D floating icon with soft ambient glow shadow (splash screen)
│   ├── master-adaptive-foreground.png              # Android adaptive icon foreground layer (within 66% safe area)
│   └── master-adaptive-background.png              # Android adaptive icon background layer (vibrant blue gradient)
│
├── expo/                                           # Ready for Expo / React Native (apps/mobile/assets)
│   ├── icon.png                                    # 1024x1024 Full-bleed master app icon
│   ├── adaptive-icon.png                           # 1024x1024 Safe-area foreground on transparent canvas
│   ├── splash-icon.png                             # 512x512 Floating mascot icon for splash screen
│   └── favicon.png                                 # 48x48 Mobile web/preview favicon
│
├── ios/                                            # Apple iOS & iPadOS Xcode Catalog
│   └── AppIcon.appiconset/
│       ├── Contents.json                           # Official Xcode Asset Catalog definition
│       ├── AppIcon-1024x1024@1x.png                # App Store Marketing Icon (1024x1024)
│       ├── AppIcon-60x60@3x.png                    # iPhone App Icon @3x (180x180)
│       ├── AppIcon-60x60@2x.png                    # iPhone App Icon @2x (120x120)
│       ├── AppIcon-76x76@2x.png                    # iPad App Icon @2x (152x152)
│       ├── AppIcon-83.5x83.5@2x.png                # iPad Pro App Icon @2x (167x167)
│       ├── AppIcon-40x40@3x.png                    # Spotlight iPhone @3x (120x120)
│       ├── AppIcon-40x40@2x.png                    # Spotlight iPad / iPhone @2x (80x80)
│       ├── AppIcon-29x29@3x.png                    # Settings iPhone @3x (87x87)
│       ├── AppIcon-29x29@2x.png                    # Settings iPad / iPhone @2x (58x58)
│       ├── AppIcon-20x20@3x.png                    # Notification iPhone @3x (60x60)
│       └── AppIcon-20x20@2x.png                    # Notification iPad / iPhone @2x (40x40)
│
├── android/                                        # Android Studio Native Resources
│   ├── playstore-512x512.png                       # Google Play Store listing icon (512x512)
│   └── res/
│       ├── values/
│       │   └── ic_launcher_background.xml
│       ├── mipmap-mdpi/                            # 48x48 (ic_launcher, ic_launcher_round, foreground 108px)
│       ├── mipmap-hdpi/                            # 72x72 (ic_launcher, ic_launcher_round, foreground 162px)
│       ├── mipmap-xhdpi/                           # 96x96 (ic_launcher, ic_launcher_round, foreground 216px)
│       ├── mipmap-xxhdpi/                          # 144x144 (ic_launcher, ic_launcher_round, foreground 324px)
│       └── mipmap-xxxhdpi/                         # 192x192 (ic_launcher, ic_launcher_round, foreground 432px)
│
├── store-and-marketing/                            # App Store & Google Play Store Marketing
│   ├── playstore-icon-512x512.png                  # Google Play Store 512x512 icon
│   ├── appstore-icon-1024x1024.png                 # Apple App Store 1024x1024 icon
│   ├── googleplay-feature-graphic-1024x500.png     # Official Google Play 1024x500 Feature Graphic
│   ├── bharatdoc-social-card-1200x630.png          # BharatDoc 1200x630 social share card
│   ├── avatar-circle-512x512.png                   # App social avatar (round)
│   └── avatar-square-512x512.png                   # App social avatar (square)
│
└── standard-sizes/                                 # Universal Resolution Exports
    ├── transparent/                                # Cutout squircle on transparent background
    │   └── icon-[16..1024].png                     # 16, 32, 48, 64, 128, 256, 512, 1024
    └── fullbleed/                                  # Full square edge-to-edge gradient
        └── icon-[16..1024].png                     # 16, 32, 48, 64, 128, 256, 512, 1024
```

---

## 🚀 How to Apply to BharatDoc Mobile App

When you wish to apply these assets to the mobile app:
1. **Expo / React Native App**:
   - Copy `logo-pack/expo/icon.png` to `apps/mobile/assets/icon.png`
   - Copy `logo-pack/expo/adaptive-icon.png` to `apps/mobile/assets/adaptive-icon.png`
   - Copy `logo-pack/expo/splash-icon.png` to `apps/mobile/assets/splash/logo-mascot.png`
2. **Google Play Console Submission**:
   - App Icon: `logo-pack/store-and-marketing/playstore-icon-512x512.png`
   - Feature Graphic: `logo-pack/store-and-marketing/googleplay-feature-graphic-1024x500.png`
3. **Apple App Store Connect Submission**:
   - App Icon: `logo-pack/store-and-marketing/appstore-icon-1024x1024.png`
4. **Xcode Native Project**:
   - Replace `AppIcon.appiconset` with `logo-pack/ios/AppIcon.appiconset`
5. **Android Native Studio Project**:
   - Merge `logo-pack/android/res/` into `android/app/src/main/res/`

---

## 🔍 Visual Showcase
Open `logo-pack/preview.html` in your browser to view all assets, toggle light/dark canvas, and inspect resolutions.
