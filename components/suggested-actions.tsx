"use client";

import { motion } from "framer-motion";
import { Button } from "./ui/button";
import { memo } from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { VisibilityType } from "./visibility-selector";

interface SuggestedActionsProps {
  chatId: string;
  append: UseChatHelpers["append"];
  selectedVisibilityType: VisibilityType;
}

function PureSuggestedActions({
  chatId,
  append,
  selectedVisibilityType,
}: SuggestedActionsProps) {
  const suggestedActions = [
    {
      title: "Read my last 5 Gmail emails",
      label: "and summarize them.",
      action: "Read my last 5 Gmail emails and summarize them.",
    },
    {
      title: "What issues are assigned to me",
      label: `in Jira. Order by projects.`,
      action: `What issues are assigned to me in Jira. Order by projects.`,
    },
    {
      title: "check if I am free in google calendar",
      label: "and fix a meeting with Gitesh(gitesh@innovunglobal.com)",
      action: "Check if I am free in google calendar and fix a meeting with Gitesh(gitesh@innovunglobal.com)  on 22nd September 2025 at 10:00 AM",
    },
    {
      title: "Fetch my 5 upcoming Google Calendar events",
      label: "and summarize them.",
      action: "Fetch my Google Calendar upcoming events and summarize them.",
    },
    {
      title: "Fetch my last 5 Outlook emails",
      label: "and summarize them.",
      action: "Fetch my Outlook emails and summarize them.",
    },
    {
      title: "Show my Teams meetings",
      label: "and upcoming events.",
      action: "Show my Teams meetings and upcoming events.",
    },
    {
      title: "List my Jira issues",
      label: "assigned to me, grouped by project.",
      action: "List my Jira issues assigned to me, grouped by project.",
    },
    {
      title: "Show my Confluence pages",
      label: "recently updated or created.",
      action: "Show my Confluence pages recently updated or created.",
    },
    {
      title: "List my Google Calendar events",
      label: "for this week.",
      action: "List my Google Calendar events for this week.",
    },
    {
      title: "Show my GitHub repositories",
      label: "and recent commits.",
      action: "Show my GitHub repositories and recent commits.",
    },
  ];

  return (
    <div
      data-testid="suggested-actions"
      className="grid sm:grid-cols-2 gap-2 w-full"
    >
      {suggestedActions.map((suggestedAction, index) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          key={`suggested-action-${suggestedAction.title}-${index}`}
          className={index > 1 ? "hidden sm:block" : "block"}
        >
          <Button
            variant="ghost"
            onClick={async () => {
              window.history.replaceState({}, "", `/chat/${chatId}`);

              append({
                role: "user",
                content: suggestedAction.action,
              });
            }}
            className="text-left border rounded-xl px-4 py-3.5 text-sm flex-1 gap-1 sm:flex-col w-full h-auto justify-start items-start"
          >
            <span className="font-medium">{suggestedAction.title}</span>
            <span className="text-muted-foreground">
              {suggestedAction.label}
            </span>
          </Button>
        </motion.div>
      ))}
    </div>
  );
}

export const SuggestedActions = memo(
  PureSuggestedActions,
  (prevProps, nextProps) => {
    if (prevProps.chatId !== nextProps.chatId) return false;
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType)
      return false;

    return true;
  },
);
