import type { Metadata } from "next";

type PublicPageMetadataInput = {
  title: string;
  description: string;
  path: string;
};

const SOCIAL_IMAGE = "/branding/studenv-v2.2-shelf-preview.png";

export function createPublicPageMetadata({
  title,
  description,
  path,
}: PublicPageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: "Studenv",
      title,
      description,
      url: path,
      images: [
        {
          url: SOCIAL_IMAGE,
          alt: "A preview of the Studenv learning environment",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SOCIAL_IMAGE],
    },
  };
}
