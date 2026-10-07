import { useMemo } from "react";
import type { ProfileMenuItem } from "@taruvi/navkit/src/types";

// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

/**
 * Custom entries for the Navkit profile menu (avatar dropdown).
 * Items appear after dark mode and before Logout.
 *
 * @see docs/GETTING_STARTED.md#custom-profile-menu-items
 */
export function useNavkitProfileMenuItems(): ProfileMenuItem[] {
  return useMemo(
    () => [
      // Example:
      // {
      //   title: "Report an issue",
      //   icon: <FontAwesomeIcon icon={["fas", "comments"]} />,
      //   callBackFunc: () => {
      //     window.open("https://support.example.com", "_blank", "noopener,noreferrer");
      //   },
      // },
    ],
    [],
  );
}
