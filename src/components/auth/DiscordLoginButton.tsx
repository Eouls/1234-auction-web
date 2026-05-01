"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export function DiscordLoginButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleLogin() {
    setIsLoading(true);
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setErrorMessage("Discord 로그인 요청을 시작하지 못했습니다.");
      setIsLoading(false);
    }
  }

  return (
    <div>
      <Button className="w-full" disabled={isLoading} onClick={handleLogin} size="lg" type="button">
        {isLoading ? "Discord로 이동 중..." : "Discord로 로그인"}
      </Button>
      {errorMessage ? <p className="mt-3 text-center text-xs text-rose-300">{errorMessage}</p> : null}
    </div>
  );
}
