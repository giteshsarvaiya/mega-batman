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
      title: "Read my last 5 emails",
      label: "and summarize them.",
      action: "Read my last 5 emails and summarize them.",
    },
    {
      title: "Star the repository `composiohq/composio`",
      label: `on GitHub`,
      action: `Star the repository \`composiohq/composio\` on GitHub`,
    },
    {
      title: "What issues are assigned to me",
      label: `in Jira. Order by projects.`,
      action: `What issues are assigned to me in Jira. Order by projects.`,
    },
    {
      title: "Fetch my Outlook details",
      label: "using the Outlook tool.",
      action: "Fetch my Outlook details using the Outlook tool.",
    },
    {
      title: "Fetch my Teams details",
      label: "using the Teams tool.",
      action: "Fetch my Teams details using the Teams tool.",
    },
    {
      title: "Fetch my Jira details",
      label: "using the Jira tool.",
      action: "Fetch my Jira details using the Jira tool.",
    },
    {
      title: "Fetch my Confluence details",
      label: "using the Confluence tool.",
      action: "Fetch my Confluence details using the Confluence tool.",
    },
    {
      title: "Fetch my Google Calendar details",
      label: "using the Google Calendar tool.",
      action: "Fetch my Google Calendar details using the Google Calendar tool.",
    },
    {
      title: "Fetch my GitHub details",
      label: "using the GitHub tool.",
      action: "Fetch my GitHub details using the GitHub tool.",
    },
    {
      title: "Fetch my Gmail details",
      label: "using the Gmail tool.",
      action: "Fetch my Gmail details using the Gmail tool.",
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
