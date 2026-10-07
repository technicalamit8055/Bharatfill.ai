import "./index.css";
import { Composition } from "remotion";
import { BharatfillPromo } from "./promo/BharatfillPromo";
import { COMBINED_DURATION, CombinedPromo } from "./promo/CombinedPromo";
import { DocsPromo } from "./promo/DocsPromo";
import { DOCS_DURATION } from "./promo/docs-timeline";
import {
  defaultDocsPromoProps,
  defaultPromoProps,
  docsPromoSchema,
  promoSchema,
} from "./promo/schema";
import { DURATION, FPS, HEIGHT, WIDTH } from "./promo/timeline";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        // Render with: npx remotion render BharatfillPromo out/bharatfill-promo.mp4
        id="BharatfillPromo"
        component={BharatfillPromo}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        schema={promoSchema}
        defaultProps={defaultPromoProps}
      />
      <Composition
        // Render with: npx remotion render BharatfillDocsPromo out/bharatfill-docs-promo.mp4
        id="BharatfillDocsPromo"
        component={DocsPromo}
        durationInFrames={DOCS_DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        schema={docsPromoSchema}
        defaultProps={defaultDocsPromoProps}
      />
      <Composition
        // Render with: npx remotion render BharatfillCombinedPromo out/bharatfill-combined-promo.mp4
        id="BharatfillCombinedPromo"
        component={CombinedPromo}
        durationInFrames={COMBINED_DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
