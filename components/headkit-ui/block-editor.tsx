import "./../../app/_editorial/wp-block-library.css";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { ProductCarousel } from "@/components/headkit-ui/product-carousel";
import { sanitizeContent } from "@/lib/sanitize-content";
import type { ProcessedEditorBlock } from "@/lib/process-editor-blocks";
import type { Product } from "@headkit/sdk";

interface Props {
  blocks: ProcessedEditorBlock[];
  /**
   * When set, only blocks with this `section` class are rendered.
   * When omitted, every block in `blocks` is rendered (document-order segments).
   */
  section?: string;
}

const MEDIA_CLASSES = [
  "headkit-embed",
  "headkit-gallery",
  "headkit-video-feature",
] as const;

function isMediaBlock(cssClasses: string[]): boolean {
  return MEDIA_CLASSES.some((cls) => cssClasses.includes(cls));
}

const BlockEditor = ({ blocks, section }: Props) => {
  const result =
    section === undefined
      ? blocks
      : blocks?.filter((block) => block.section === section);
  return (
    <>
      {result?.map((data: ProcessedEditorBlock, index: number) => {
        if (data.cssClasses.includes("headkit-hilight")) {
          return (
            <AboutUs
              key={index}
              title={data.title}
              content={data.description}
              buttonText={data.button?.text}
              buttonLink={data.button?.url}
              buttonTarget={data.button?.linkTarget}
            />
          );
        }

        if (data.cssClasses.includes("headkit-product-carousel")) {
          const products: Product[] = data.products ?? [];
          if (products.length === 0) return null;
          return (
            <div className="py-[30px] overflow-hidden" key={index}>
              <SectionHeader
                title={data.title}
                description={data.description}
                allButton={data.button?.text ?? ""}
                allButtonPath={data.button?.url ?? ""}
                className="px-5 md:px-10"
              />
              <div className="mt-5">
                <ProductCarousel products={products} />
              </div>
            </div>
          );
        }

        if (isMediaBlock(data.cssClasses) || data.html) {
          const clean = sanitizeContent(data.html ?? "");
          if (!clean.trim()) return null;

          const isVideoFeature = data.cssClasses.includes(
            "headkit-video-feature",
          );

          return (
            <div
              key={index}
              className={
                isVideoFeature
                  ? "headkit-video-feature-wrap overflow-hidden"
                  : "px-5 md:px-10 py-10 overflow-hidden"
              }
            >
              <div
                className="wp-block-content prose max-w-none"
                dangerouslySetInnerHTML={{ __html: clean }}
              />
            </div>
          );
        }

        return null;
      })}
    </>
  );
};

interface AboutUsProps {
  title: string;
  content: string;
  buttonText: string | null | undefined;
  buttonLink: string | null | undefined;
  buttonTarget: string | null | undefined;
}

const AboutUs = ({
  title,
  content,
  buttonText,
  buttonLink,
  buttonTarget,
}: AboutUsProps) => {
  return (
    <div className="relative grid h-fit w-full grid-cols-1 gap-8 px-5 md:px-10 py-14 md:grid-cols-3">
      <div className="md:col-span-2">
        <h1 className="mb-5 text-3xl font-semibold">{title}</h1>
        <div
          dangerouslySetInnerHTML={{ __html: content }}
          className="prose text-purple-800 max-w-full"
        />
      </div>
      <div className="flex items-center">
        <a
          href={buttonLink ?? "#"}
          target={buttonTarget ?? ""}
          className="w-full"
        >
          <Button variant="secondary" rightIcon="arrowRight" fullWidth>
            {buttonText}
          </Button>
        </a>
      </div>
    </div>
  );
};

export { BlockEditor };
