import type { User as SupabaseUser } from "@supabase/supabase-js";

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
