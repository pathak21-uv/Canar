import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function AuthMinimal() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const { user, loginMutation, registerMutation } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user) {
      setLocation("/profile");
    }
  }, [user, setLocation]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({
      username: email.trim(),
      password,
    }, {
      onSuccess: () => {
        setLocation("/profile");
      }
    });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert("Passwords don't match");
      return;
    }
    registerMutation.mutate({
      email: email.trim(),
      username: username.trim(),
      password,
    }, {
      onSuccess: () => {
        setLocation("/profile");
      }
    });
  };

  const inputClassName =
    "mb-4 w-full rounded border border-[#ccc] bg-white p-3 text-base text-black";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f5] p-5">
      <div className="w-full max-w-[25rem] rounded-lg bg-white p-6 shadow-[0_0.125rem_0.625rem_rgba(0,0,0,0.1)] sm:p-10">
        <h1 className="mb-8 text-center text-3xl font-semibold text-[#333]">
          Canar - {isLogin ? "Sign In" : "Sign Up"}
        </h1>

        <form onSubmit={isLogin ? handleLogin : handleRegister}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClassName}
            required
          />

          {!isLogin && (
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClassName}
              required
            />
          )}

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClassName} pr-11`}
              minLength={8}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-3 z-[1] cursor-pointer border-0 bg-transparent p-0 text-[#666]"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {!isLogin && (
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`${inputClassName} pr-11`}
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((current) => !current)}
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                className="absolute right-3 top-3 z-[1] cursor-pointer border-0 bg-transparent p-0 text-[#666]"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          )}

          <button
            type="submit"
            className="mb-4 w-full cursor-pointer rounded border-0 bg-[#007bff] p-3 text-base text-white disabled:cursor-not-allowed disabled:opacity-70"
            disabled={loginMutation.isPending || registerMutation.isPending}
          >
            {(loginMutation.isPending || registerMutation.isPending) ? "Loading..." : (isLogin ? "Sign In" : "Sign Up")}
          </button>

          <p className="text-center text-[#666]">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="cursor-pointer border-0 bg-transparent text-[#007bff] underline"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}