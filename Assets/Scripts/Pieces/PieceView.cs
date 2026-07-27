using System.Collections;
using System.Collections.Generic;
using BlockPlus.Input;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace BlockPlus.Pieces
{
    public sealed class PieceView : MonoBehaviour, IBeginDragHandler, IDragHandler, IEndDragHandler
    {
        [SerializeField] private RectTransform root;
        [SerializeField] private RectTransform cellContainer;
        [SerializeField] private GridLayoutGroup gridLayout;
        [SerializeField] private Image cellPrefab;
        [SerializeField] private CanvasGroup canvasGroup;
        [SerializeField] private LayoutElement layoutElement;
        [SerializeField] private float trayCellSize = 24f;
        [SerializeField] private float dragCellSize = 28f;
        [SerializeField] private Vector2 cellSpacing = new Vector2(4f, 4f);

        private readonly List<Image> spawnedCells = new List<Image>(9);

        private InputManager inputManager;
        private RuntimePiece piece;
        private RectTransform homeSlot;
        private RectTransform dragLayer;
        private Coroutine moveCoroutine;
        private bool dragging;

        public RuntimePiece Piece => piece;
        public RectTransform RectTransform => root;

        public void Initialize(InputManager owner, RectTransform assignedHomeSlot, RectTransform assignedDragLayer)
        {
            inputManager = owner;
            homeSlot = assignedHomeSlot;
            dragLayer = assignedDragLayer;
            ReturnToHomeImmediate();
            Hide();
        }

        public void Bind(RuntimePiece runtimePiece)
        {
            piece = runtimePiece;
            gameObject.SetActive(true);
            canvasGroup.alpha = 1f;
            canvasGroup.blocksRaycasts = true;
            BuildVisuals(trayCellSize);
            ReturnToHomeImmediate();
        }

        public void Hide()
        {
            piece = null;
            gameObject.SetActive(false);
            dragging = false;
        }

        public void PrepareForDrag()
        {
            if (moveCoroutine != null)
            {
                StopCoroutine(moveCoroutine);
                moveCoroutine = null;
            }

            dragging = true;
            // Dragging re-parents the piece into a top-most layer so it never renders behind the board.
            transform.SetParent(dragLayer, worldPositionStays: false);
            transform.SetAsLastSibling();
            canvasGroup.blocksRaycasts = false;
            canvasGroup.alpha = 0.94f;
            BuildVisuals(dragCellSize);
            root.localScale = Vector3.one * 1.08f;
        }

        public void SetScreenPosition(Vector2 screenPosition, Camera uiCamera)
        {
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(dragLayer, screenPosition, uiCamera, out Vector2 localPoint))
            {
                return;
            }

            root.anchoredPosition = localPoint;
        }

        public void ReturnToHomeAnimated()
        {
            if (moveCoroutine != null)
            {
                StopCoroutine(moveCoroutine);
            }

            moveCoroutine = StartCoroutine(MoveToHomeRoutine());
        }

        public void ReturnToHomeImmediate()
        {
            transform.SetParent(homeSlot, worldPositionStays: false);
            root.anchorMin = new Vector2(0.5f, 0.5f);
            root.anchorMax = new Vector2(0.5f, 0.5f);
            root.pivot = new Vector2(0.5f, 0.5f);
            root.anchoredPosition = Vector2.zero;
            root.localScale = Vector3.one;
            canvasGroup.blocksRaycasts = true;
            canvasGroup.alpha = 1f;
            BuildVisuals(trayCellSize);
        }

        public void CompletePlacement()
        {
            dragging = false;
            Hide();
        }

        public void OnBeginDrag(PointerEventData eventData)
        {
            if (piece == null)
            {
                return;
            }

            inputManager.BeginDrag(this, eventData);
        }

        public void OnDrag(PointerEventData eventData)
        {
            if (piece == null)
            {
                return;
            }

            inputManager.UpdateDrag(this, eventData);
        }

        public void OnEndDrag(PointerEventData eventData)
        {
            if (!dragging)
            {
                return;
            }

            inputManager.EndDrag(this, eventData);
        }

        private void BuildVisuals(float cellSize)
        {
            if (piece == null || piece.Shape == null)
            {
                return;
            }

            // The tray and drag view share the same script. Only the cell size changes.
            int width = piece.Shape.Width;
            int height = piece.Shape.Height;
            int totalSlots = width * height;

            while (spawnedCells.Count < totalSlots)
            {
                Image instance = Instantiate(cellPrefab, cellContainer);
                spawnedCells.Add(instance);
            }

            gridLayout.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
            gridLayout.constraintCount = width;
            gridLayout.cellSize = new Vector2(cellSize, cellSize);
            gridLayout.spacing = cellSpacing;

            float widthPixels = (width * cellSize) + ((width - 1) * cellSpacing.x);
            float heightPixels = (height * cellSize) + ((height - 1) * cellSpacing.y);
            layoutElement.preferredWidth = widthPixels;
            layoutElement.preferredHeight = heightPixels;
            cellContainer.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal, widthPixels);
            cellContainer.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical, heightPixels);

            for (int index = 0; index < spawnedCells.Count; index++)
            {
                spawnedCells[index].gameObject.SetActive(index < totalSlots);
            }

            for (int row = 0; row < height; row++)
            {
                for (int column = 0; column < width; column++)
                {
                    int index = row * width + column;
                    Image image = spawnedCells[index];
                    bool active = ContainsCell(column, row);
                    image.enabled = active;
                    image.color = active ? piece.Tint : Color.clear;
                }
            }
        }

        private bool ContainsCell(int column, int row)
        {
            IReadOnlyList<Vector2Int> cells = piece.Shape.Cells;
            for (int index = 0; index < cells.Count; index++)
            {
                if (cells[index].x == column && cells[index].y == row)
                {
                    return true;
                }
            }

            return false;
        }

        private IEnumerator MoveToHomeRoutine()
        {
            dragging = false;
            canvasGroup.blocksRaycasts = false;
            Vector3 startPosition = root.position;
            Quaternion startRotation = root.rotation;
            Vector3 targetPosition = homeSlot.position;
            float elapsed = 0f;
            const float duration = 0.18f;

            transform.SetParent(dragLayer, worldPositionStays: true);

            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                float t = Mathf.Clamp01(elapsed / duration);
                root.position = Vector3.Lerp(startPosition, targetPosition, 1f - Mathf.Pow(1f - t, 3f));
                root.rotation = Quaternion.Slerp(startRotation, Quaternion.identity, t);
                root.localScale = Vector3.Lerp(root.localScale, Vector3.one, t);
                yield return null;
            }

            ReturnToHomeImmediate();
            moveCoroutine = null;
        }
    }
}
