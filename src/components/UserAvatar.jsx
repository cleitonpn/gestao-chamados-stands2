// src/components/UserAvatar.jsx
import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "../contexts/AuthContext";

const initials = (nameOrEmail) => {
  const s = String(nameOrEmail || "");
  const parts = s.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (s[0] || "U").toUpperCase();
};

export default function UserAvatar({ className = "h-8 w-8" }) {
  const { user, userProfile, avatarURL } = useAuth();
  const name = userProfile?.nome || user?.displayName || user?.email;
  return (
    <Avatar className={className}>
      {avatarURL ? (
        <AvatarImage src={avatarURL} alt={name || "avatar"} />
      ) : (
        <AvatarFallback>{initials(name)}</AvatarFallback>
      )}
    </Avatar>
  );
}
