UPDATE UserCode SET Receiver = 'Cinemotes';

CREATE TRIGGER user_code_receiver_insert
BEFORE INSERT ON UserCode
WHEN typeof(NEW.Receiver) != 'text' OR length(trim(NEW.Receiver)) = 0 OR length(NEW.Receiver) > 120
BEGIN
  SELECT RAISE(ABORT, 'Receiver obrigatório, com até 120 caracteres');
END;

CREATE TRIGGER user_code_receiver_update
BEFORE UPDATE OF Receiver ON UserCode
WHEN typeof(NEW.Receiver) != 'text' OR length(trim(NEW.Receiver)) = 0 OR length(NEW.Receiver) > 120
BEGIN
  SELECT RAISE(ABORT, 'Receiver obrigatório, com até 120 caracteres');
END;
