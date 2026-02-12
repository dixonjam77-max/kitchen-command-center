"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  Home, Refrigerator, Wrench, BookOpen, Calendar,
  ShoppingCart, BarChart3, LogOut, Upload,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";

const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/pantry", label: "Pantry", icon: Refrigerator },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/meal-plan", label: "Meal Plan", icon: Calendar },
  { href: "/grocery", label: "Grocery", icon: ShoppingCart },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/import", label: "Import / Export", icon: Upload },
];

export function Navigation() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  return (
    <aside className="w-64 border-r bg-card flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b">
        <h1 className="text-lg font-bold text-primary">Kitchen Command Center</h1>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              pathname === href
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-accent"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      {user && (
        <div className="p-4 border-t">
          <div className="text-sm font-medium">{user.name || user.email}</div>
          <button
            onClick={logout}
            className="flex items-center gap-2 mt-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
