type LaunchImageUploadProps = {
  error?: string | null;
  fileName?: string | null;
  helperText: string;
  inputId: string;
  previewUrl?: string | null;
  required?: boolean;
  secondaryText?: string;
  title: string;
  onSelectFile: (fileList: FileList | null) => void;
};

export function LaunchImageUpload({
  error,
  fileName,
  helperText,
  inputId,
  previewUrl,
  required = false,
  secondaryText,
  title,
  onSelectFile
}: LaunchImageUploadProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-semibold text-white" htmlFor={inputId}>
          {title}
          {required ? <span className="ml-1 text-cyan-200">*</span> : null}
        </label>
        <span className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
          PNG, JPG, WEBP
        </span>
      </div>

      <label
        className={[
          "group block cursor-pointer rounded-[1.25rem] border border-dashed bg-[rgba(255,255,255,0.03)] p-4 transition",
          error
            ? "border-rose-300/35 bg-rose-300/10"
            : "border-white/10 hover:border-cyan-300/30 hover:bg-[rgba(255,255,255,0.05)]"
        ].join(" ")}
        htmlFor={inputId}
      >
        <input
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          id={inputId}
          onChange={(event) => onSelectFile(event.target.files)}
          type="file"
        />

        <div className="flex min-h-[8.75rem] flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[1.15rem] border border-white/10 bg-[rgba(7,10,16,0.72)]">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Token artwork preview"
                className="h-full w-full object-cover"
                src={previewUrl}
              />
            ) : (
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/75">
                Artwork
              </span>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-white">
              {fileName ? fileName : "Drop token artwork here or click to browse"}
            </p>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">{helperText}</p>
            {secondaryText ? (
              <p className="text-xs leading-5 text-[var(--text-faint)]">{secondaryText}</p>
            ) : null}
          </div>
        </div>
      </label>

      {error ? <p className="text-sm leading-6 text-rose-200">{error}</p> : null}
    </div>
  );
}
