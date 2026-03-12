import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { ProductCarousel } from "@/components/headkit-ui/product-carousel";
import type { EditorBlock, Product } from "@headkit/sdk";

interface Props {
  blocks: EditorBlock[];
  section?: string;
}

const BlockEditor = ({ blocks, section = "section-1" }: Props) => {
  const result = blocks?.filter((block) => block.section === section);
  return (
    <>
      {result?.map((data: EditorBlock, index: number) => {
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
