import React from "react";
import { Img, staticFile } from "remotion";
import { ASSETS, optionalAsset } from "../assets";

/*
 * The logo PNGs carry transparent padding (and the mark has a stray slice of
 * the wordmark on its right), so both are shown through a crop window.
 */

const LOGO = { width: 1915, height: 821, crop: { x: 70, y: 110, w: 1770, h: 565 } };
const MARK = { width: 512, height: 512, crop: { x: 2, y: 60, w: 390, h: 398 } };

type Source = typeof LOGO | typeof MARK;

const Cropped: React.FC<{ src: string; source: Source; width: number }> = ({
  src,
  source,
  width,
}) => {
  const scale = width / source.crop.w;
  return (
    <div
      style={{
        position: "relative",
        width,
        height: source.crop.h * scale,
        overflow: "hidden",
      }}
    >
      <Img
        src={src}
        style={{
          position: "absolute",
          left: -source.crop.x * scale,
          top: -source.crop.y * scale,
          width: source.width * scale,
          height: source.height * scale,
          maxWidth: "none",
        }}
      />
    </div>
  );
};

export const MarkIcon: React.FC<{ size: number }> = ({ size }) => (
  <Cropped src={staticFile(ASSETS.mark)} source={MARK} width={size} />
);

/**
 * 3D Dark Mode Brand Banner with neon laser glow, reflective cyber floor,
 * and light streak sweep.
 */
export const LogoPlate: React.FC<{
  width: number;
  glow: number;
  shine: number;
}> = ({ width, glow, shine }) => {
  const banner = optionalAsset(ASSETS.banner);

  if (banner) {
    const height = (width * 341) / 1024;
    return (
      <div
        style={{
          position: "relative",
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Radiant Cyber Blue & Saffron ambient aura behind the banner */}
        <div
          style={{
            position: "absolute",
            inset: "-25%",
            background: `radial-gradient(ellipse at 40% 45%, rgba(0,229,255,${0.38 + 0.22 * glow}) 0%, rgba(0,102,255,${0.24 + 0.16 * glow}) 35%, rgba(255,153,51,0.12) 65%, transparent 75%)`,
            filter: "blur(46px)",
            pointerEvents: "none",
          }}
        />

        {/* Main 3D Brand Banner — frameless; the glow follows the logo's alpha */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
          }}
        >
          <Img
            src={banner}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              filter: `drop-shadow(0 0 ${14 + 18 * glow}px rgba(0,229,255,${0.35 + 0.3 * glow})) drop-shadow(0 18px 30px rgba(0,0,0,0.7))`,
            }}
          />

          {/* Dynamic light streak shimmer, masked to the logo's shape */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              WebkitMaskImage: `url(${banner})`,
              maskImage: `url(${banner})`,
              WebkitMaskSize: "100% 100%",
              maskSize: "100% 100%",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-20%",
                bottom: "-20%",
                left: `${-35 + shine * 170}%`,
                width: "22%",
                transform: "skewX(-22deg)",
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.65), rgba(0,229,255,0.7), transparent)",
                opacity: shine > 0 && shine < 1 ? 1 : 0,
              }}
            />
          </div>
        </div>

        {/* Glossy Wet Floor Reflection */}
        <div
          style={{
            position: "absolute",
            top: "100%",
            width: "100%",
            height: height * 0.3,
            overflow: "hidden",
            opacity: 0.28 * (0.8 + 0.2 * glow),
            transform: "scaleY(-1)",
            filter: "blur(3px)",
            // Before the flip, the bottom of this box sits against the logo.
            WebkitMaskImage:
              "linear-gradient(to top, black 0%, transparent 75%)",
            maskImage: "linear-gradient(to top, black 0%, transparent 75%)",
            pointerEvents: "none",
          }}
        >
          {/* Bottom-aligned so the mirror starts at the logo's base, not its flag. */}
          <Img
            src={banner}
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              width: "100%",
              height,
            }}
          />
        </div>
      </div>
    );
  }

  // Fallback if banner is not available
  return (
    <div
      style={{
        position: "relative",
        padding: `${width * 0.045}px ${width * 0.06}px`,
        borderRadius: width * 0.05,
        background: "linear-gradient(160deg, #ffffff 0%, #eef2ff 100%)",
        border: "1px solid rgba(255,255,255,0.7)",
        boxShadow: `0 0 ${50 + 70 * glow}px rgba(99,102,241,${0.3 + 0.4 * glow})`,
        overflow: "hidden",
      }}
    >
      <Cropped src={staticFile(ASSETS.logo)} source={LOGO} width={width} />
    </div>
  );
};
