import { Show, UserButton } from "@clerk/nextjs";

export default function TopBar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-4">
      <span className="font-semibold tracking-tight">Journey</span>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </header>
  );
}
