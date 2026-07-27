using BlockPlus.Board;
using BlockPlus.Core;
using BlockPlus.Pieces;
using UnityEngine;
using UnityEngine.EventSystems;

namespace BlockPlus.Input
{
    public sealed class InputManager : MonoBehaviour
    {
        [SerializeField] private Canvas gameplayCanvas;
        [SerializeField] private Camera gameplayCamera;
        [SerializeField] private BoardManager boardManager;
        [SerializeField] private GameManager gameManager;

        private PieceView activeView;
        private RuntimePiece activePiece;
        private Vector2Int activeAnchor;
        private bool previewValid;

        public void BeginDrag(PieceView view, PointerEventData eventData)
        {
            if (!gameManager.TryBeginDrag(view, out RuntimePiece piece))
            {
                return;
            }

            // InputManager owns the visual drag loop while GameManager owns game rules.
            activeView = view;
            activePiece = piece;
            previewValid = false;
            view.PrepareForDrag();
            UpdateDrag(view, eventData);
        }

        public void UpdateDrag(PieceView view, PointerEventData eventData)
        {
            if (view != activeView || activePiece == null)
            {
                return;
            }

            Camera camera = GetCamera(eventData);
            view.SetScreenPosition(eventData.position, camera);

            if (boardManager.TryGetAnchorFromScreenPosition(eventData.position, activePiece.Shape, camera, out Vector2Int anchor))
            {
                activeAnchor = anchor;
                previewValid = boardManager.ShowPreview(activePiece, anchor);
            }
            else
            {
                previewValid = false;
                boardManager.ClearPreview();
            }
        }

        public void EndDrag(PieceView view, PointerEventData eventData)
        {
            if (view != activeView)
            {
                return;
            }

            boardManager.ClearPreview();

            // If placement is invalid, the piece animates back into its tray slot.
            bool placed = previewValid && gameManager.TryPlaceDraggedPiece(view, activeAnchor);
            if (!placed)
            {
                view.ReturnToHomeAnimated();
            }

            activeView = null;
            activePiece = null;
            previewValid = false;
        }

        private Camera GetCamera(PointerEventData eventData)
        {
            if (eventData.pressEventCamera != null)
            {
                return eventData.pressEventCamera;
            }

            if (gameplayCanvas.renderMode == RenderMode.ScreenSpaceOverlay)
            {
                return null;
            }

            return gameplayCamera != null ? gameplayCamera : gameplayCanvas.worldCamera;
        }
    }
}
