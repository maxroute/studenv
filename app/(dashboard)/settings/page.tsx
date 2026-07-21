import { SettingsPage } from "@/components/layout/settings-page";

export default function SettingsRoute() {
  return (
    <div className="h-full overflow-hidden px-6 pt-6 pb-0 md:px-8 md:pt-7 md:pb-0 xl:px-10 xl:pt-9 xl:pb-0">
      <div className="mx-auto h-full w-full max-w-6xl overflow-hidden">
        <SettingsPage />
      </div>
    </div>
  );
}
