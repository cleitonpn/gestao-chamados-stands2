// src/pages/UserProfilePage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { userService } from "../services/userService";
import {
  updateProfile as fbUpdateProfile,
  updateEmail as fbUpdateEmail,
  updatePassword as fbUpdatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, storage } from "../config/firebase";

// shadcn/ui components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Save, Shield, Mail, Lock, User } from "lucide-react";

function initialsFromName(name) {
  const parts = String(name || "").trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "U";
}

const UserProfilePage = () => {
  const { user, userProfile, authInitialized } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [localPhoto, setLocalPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const uid = useMemo(() => user?.uid || userProfile?.id || userProfile?.uid, [user, userProfile]);

  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile?.nome || user?.displayName || "");
      setEmail(userProfile?.email || user?.email || "");
      setPhotoURL(userProfile?.fotoURL || user?.photoURL || "");
    } else if (user) {
      setDisplayName(user.displayName || "");
      setEmail(user.email || "");
      setPhotoURL(user.photoURL || "");
    }
  }, [userProfile, user]);

  const handleUploadAvatar = async (file) => {
    if (!file || !uid) return null;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `avatars/${uid}/avatar-${Date.now()}.${ext}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return url;
  };

  const reauthWithPassword = async (password) => {
    if (!user?.email) throw new Error("Usuário sem e-mail.");
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(auth.currentUser || user, credential);
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      let newPhotoURL = photoURL;
      if (localPhoto) {
        newPhotoURL = await handleUploadAvatar(localPhoto);
      }

      // 1) Atualiza Auth (displayName + photoURL)
      if (auth.currentUser || user) {
        await fbUpdateProfile(auth.currentUser || user, {
          displayName: displayName || (auth.currentUser?.displayName || user?.displayName) || "",
          photoURL: newPhotoURL || (auth.currentUser?.photoURL || user?.photoURL) || "",
        });
      }

      // 2) Atualiza Firestore (usuarios/{uid})
      if (uid) {
        await userService.updateUser(uid, {
          nome: displayName || null,
          fotoURL: newPhotoURL || null,
          email: email || null,
        });
      }

      setPhotoURL(newPhotoURL);
      setLocalPhoto(null);
      setSuccess("Perfil atualizado com sucesso!");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Falha ao atualizar o perfil.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangeEmail = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (!email) throw new Error("Informe um e-mail válido.");
      if (!currentPassword) throw new Error("Para trocar o e-mail, informe sua senha atual.");
      await reauthWithPassword(currentPassword);

      if (auth.currentUser || user) {
        await fbUpdateEmail(auth.currentUser || user, email);
      }

      if (uid) {
        await userService.updateUser(uid, { email });
      }

      setSuccess("E-mail atualizado com sucesso!");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Falha ao atualizar e-mail.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    try {
      setSavingPassword(true);
      setError("");
      setSuccess("");

      if (!currentPassword) throw new Error("Informe sua senha atual.");
      if (!newPassword || newPassword.length < 6)
        throw new Error("A nova senha deve ter no mínimo 6 caracteres.");
      if (newPassword !== confirmPassword) throw new Error("As senhas não conferem.");

      await reauthWithPassword(currentPassword);
      await fbUpdatePassword(auth.currentUser || user, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Senha alterada com sucesso!");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Falha ao alterar senha.");
    } finally {
      setSavingPassword(false);
    }
  };

  const selectFile = (e) => {
    const f = e.target.files?.[0];
    if (f) setLocalPhoto(f);
  };

  if (!authInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Carregando...</span>
      </div>
    );
  }

  if (authInitialized && !uid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Alert>
          <AlertDescription>
            Não foi possível carregar seu perfil. Faça login novamente.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full p-4 md:p-8 bg-muted/10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Meu Perfil</h1>
            <p className="text-sm text-muted-foreground">Gerencie suas informações de conta</p>
          </div>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Voltar
          </Button>
        </div>

        {(error || success) && (
          <div className="space-y-2">
            {error ? (
              <Alert className="border-red-300">
                <AlertDescription className="text-red-700">{error}</AlertDescription>
              </Alert>
            ) : null}
            {success ? (
              <Alert className="border-green-300">
                <AlertDescription className="text-green-700">{success}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}

        {/* Avatar + Nome */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" /> Informações básicas
            </CardTitle>
            <CardDescription>Foto, nome e e-mail cadastrados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  {localPhoto ? (
                    <AvatarImage src={URL.createObjectURL(localPhoto)} alt="preview" />
                  ) : photoURL ? (
                    <AvatarImage src={photoURL} alt="avatar" />
                  ) : (
                    <AvatarFallback>{initialsFromName(displayName)}</AvatarFallback>
                  )}
                </Avatar>
                <div className="space-y-2">
                  <Label htmlFor="avatar">Foto do perfil</Label>
                  <Input id="avatar" type="file" accept="image/*" onChange={selectFile} />
                  <p className="text-xs text-muted-foreground">
                    JPG/PNG recomendados. O arquivo será otimizado e salvo em segurança.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 w-full">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Nome</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Seu nome"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@empresa.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Para trocar o e-mail, informe sua senha atual e clique em “Atualizar e‑mail”.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar perfil
              </Button>
              <Button variant="outline" onClick={handleChangeEmail} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                Atualizar e‑mail
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Senha */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" /> Segurança
            </CardTitle>
            <CardDescription>Trocar sua senha de acesso</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Senha atual</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            <Button onClick={handleChangePassword} disabled={savingPassword}>
              {savingPassword ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
              Alterar senha
            </Button>
          </CardContent>
        </Card>

        <Separator />

        <p className="text-xs text-muted-foreground">
          Dica: se você alterou e-mail ou senha, pode ser necessário fazer login novamente.
        </p>
      </div>
    </div>
  );
};

export default UserProfilePage;
