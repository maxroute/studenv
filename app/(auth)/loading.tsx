import { SecondBrainLoader } from "@/components/ui/second-brain-loader";

export default function Loading() {
  return (
    <div className="boot-loader-overlay">
      <SecondBrainLoader />
    </div>
  );
}
