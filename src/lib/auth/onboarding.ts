import type { User as SupabaseUser } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

type MetadataValue = string | number | boolean | null | undefined;
type Metadata = Record<string, MetadataValue>;

function asMetadata(value: unknown): Metadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Metadata;
}

function firstString(...values: Array<MetadataValue>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export function getDiscordProfileFromAuthUser(authUser: SupabaseUser) {
  const userMetadata = asMetadata(authUser.user_metadata);
  const discordIdentity = authUser.identities?.find((identity) => identity.provider === "discord");
  const identityData = asMetadata(discordIdentity?.identity_data);

  return {
    discordId:
      firstString(
        userMetadata.provider_id,
        userMetadata.sub,
        identityData.provider_id,
        identityData.sub,
        discordIdentity?.id,
      ) ?? authUser.id,
    discordUsername: firstString(
      userMetadata.username,
      userMetadata.user_name,
      userMetadata.name,
      identityData.username,
      identityData.user_name,
      identityData.name,
    ),
    discordAvatarUrl: firstString(
      userMetadata.avatar_url,
      userMetadata.picture,
      identityData.avatar_url,
      identityData.picture,
    ),
  };
}

export function getDiscordAvatarUrlFromSupabaseUser(authUser: SupabaseUser) {
  return getDiscordProfileFromAuthUser(authUser).discordAvatarUrl;
}

export async function syncDiscordProfileFromAuthUser(authUser: SupabaseUser) {
  try {
    const discordProfile = getDiscordProfileFromAuthUser(authUser);

    const user = await prisma.user.findUnique({
      where: {
        authUserId: authUser.id,
      },
      select: {
        customProfileImageUrl: true,
        discordAvatarUrl: true,
        discordUsername: true,
        id: true,
      },
    });

    if (!user) {
      return null;
    }

    const data: {
      discordAvatarUrl?: string;
      discordUsername?: string | null;
    } = {};

    if (discordProfile.discordAvatarUrl && discordProfile.discordAvatarUrl !== user.discordAvatarUrl) {
      data.discordAvatarUrl = discordProfile.discordAvatarUrl;
    }

    if (discordProfile.discordUsername && discordProfile.discordUsername !== user.discordUsername) {
      data.discordUsername = discordProfile.discordUsername;
    }

    const updated = Object.keys(data).length > 0;

    if (updated) {
      await prisma.user.update({
        where: {
          id: user.id,
        },
        data,
      });
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[auth] discord avatar sync", {
        hasCustomProfileImage: Boolean(user.customProfileImageUrl),
        newDiscordAvatarUrlExists: Boolean(discordProfile.discordAvatarUrl),
        oldDiscordAvatarUrlExists: Boolean(user.discordAvatarUrl),
        updated,
        userId: user.id,
      });
    }

    return {
      discordAvatarUrl: data.discordAvatarUrl ?? user.discordAvatarUrl,
      updated,
    };
  } catch (error) {
    console.warn("[auth] discord avatar sync failed", {
      message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
    return null;
  }
}
