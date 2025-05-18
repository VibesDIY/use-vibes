# ImageOverlay Modal Design

A **minimal** plan for showing the existing `ImageOverlay` component in a fullscreen (or nearly-fullscreen) modal while keeping the production code simple and React-only.

---
## 1  User flow
1. User hovers the image thumbnail ⇒ a small **expand** button (`⤢`) fades‐in at the **top-right** corner of the image container.
2. User clicks the button.
3. A modal appears covering the viewport.  It shows:
   * The full-size image centred.
   * The `ImageOverlay` component **below** the image (vertical layout).
4. User can **close** the modal by:
   * Clicking the close button just above the top-right corner of the modal content, **or**
   * Pressing <kbd>Esc</kbd>, **or**
   * Clicking anywhere outside the modal content, eg on the dark backdrop.

---
## 2  Component tree sketch
```
ImgGenDisplay
 ├─ <div class="thumb-container">      // relative
 │    ├─ <ImgFile />                    // thumbnail
 │    └─ <button class="expand-btn" />  // appears on hover
 └─ {isModalOpen &&                      // portal target OR inline
      <ModalRoot>                       // fixed, covers viewport
        <div class="modal-content">    // flex-column
          <ImgFile />                   // full image
          <ImageOverlay />             // existing overlay UI
        </div>
      </ModalRoot>
    }
```

* `ModalRoot` can be plain JSX (`createPortal` is optional; inside the same component is fine unless parent has transformative CSS).
* `ImageOverlay` is reused without changes – we merely place it **under** the `<img>` instead of absolutely positioning it.

---
## 3  Implementation steps
### 3.1 State & handlers
```ts
const [isModalOpen, setIsModalOpen] = useState(false);
const openModal  = (e) => { e.stopPropagation(); setIsModalOpen(true); };
const closeModal = ()  => setIsModalOpen(false);
```
Hook an `keydown` listener when `isModalOpen` to close on <kbd>Esc</kbd>.

### 3.2 Expand button (hover reveal)
```css
.thumb-container { position:relative; }
.expand-btn {
  position:absolute; top:8px; right:8px;
  opacity:0; transition:opacity .2s;
}
.thumb-container:hover .expand-btn { opacity:.7; }
```

### 3.3 Modal root styles
```css
.modal-root {
  position:fixed; inset:0;
  display:flex; align-items:center; justify-content:center;
  background:rgba(0,0,0,.9);
  z-index:9999;
}
.modal-content {
  display:flex; flex-direction:column; align-items:center;
  max-width:90vw; max-height:90vh;
}
.modal-content img { max-width:100%; max-height:70vh; object-fit:contain; }
```

### 3.4 Render logic
```tsx
{isModalOpen && (
  <div className="modal-root" onClick={closeModal}>
    <button className="close-btn" onClick={closeModal}>✕</button>
    <div className="modal-content" onClick={e => e.stopPropagation()}>
       <ImgFile file={file} alt="Generated" />
       <ImageOverlay {...overlayProps} />
    </div>
  </div>
)}
```

*No custom events, no extra DOM manipulation.*

---
## 4  Why this is simpler than the previous attempt
| Concern | Previous overlayRoot.js | New plan |
|---------|-------------------------|-----------|
| GPU layer promotion | Kept a singleton root to avoid flicker | Browser promotes `.modal-root`; minimal churn since it mounts rarely |
| Custom events | `imggen-*` events to sync React ↔️ DOM | Pure React state ‑ no events |
| Code size | ~550 LOC util + listeners | ~40 LOC of straightforward JSX/CSS |
| Testability | Hard to unit-test DOM helpers | Easy to cover with RTL |

---
## 5  Next actions
1. Add the hover button & CSS to `ImgGen.css`.
2. Implement the modal JSX in `ImgGenDisplay.tsx` (or a tiny `Modal` component).
3. Delete `overlayRoot.ts` once migration is complete.

That's all – a lightweight modal with the existing `ImageOverlay` reused in a column layout.
